/**
 * QStash job: import Notion pages into `knowledge_documents`.
 *
 * Mirrors the Linear `initial-sync` job structure: verify the QStash signature
 * (skipped in dev, where QStash can't reach localhost), resolve the active
 * Notion connection, decode its token, page through `POST /search`, map each
 * page to a knowledge document, and upsert with `onConflictDoUpdate` keyed on
 * the unique `(organizationId, slug)` index.
 *
 * PR-2 scope: for each page, retrieve its child blocks and render Markdown into
 * `knowledge_documents.markdown`. Block import is best-effort per page so one
 * inaccessible page does not make QStash retry the whole sync job.
 */

import { buildConflictUpdateColumns, db } from "@rox/db";
import { integrationConnections, knowledgeDocuments } from "@rox/db/schema";
import { decodeSecret } from "@rox/trpc/integration-secret";
import { Receiver } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";
import chunk from "lodash.chunk";
import { z } from "zod";
import { env } from "@/env";
import {
	listBlockChildren,
	type NotionBlock,
	type NotionSearchResult,
	search,
} from "../../notion-client";
import { mapNotionPages, renderNotionBlocksToMarkdown } from "../../sync";

/** Insert chunk size — keeps each upsert statement within sane bounds. */
const BATCH_SIZE = 100;

/** Safety cap on `/search` pagination so one job can't loop unbounded. */
const MAX_PAGES = 50;
/** Safety cap on child-block pagination for a single page/block. */
const MAX_BLOCK_PAGES_PER_LEVEL = 10;
/** Safety cap on recursive child-block traversal depth. */
const MAX_BLOCK_DEPTH = 4;

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	organizationId: z.string().min(1),
	/** Optional per-workspace connection scope; omit for the org-level row. */
	workspaceId: z.string().min(1).nullish(),
	/** Optional Notion `/search` query; defaults to all shared pages. */
	query: z.string().optional(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	// Skip signature verification in development (QStash can't reach localhost).
	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}

		const isValid = await receiver.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/notion/jobs/sync`,
		});

		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId, workspaceId, query } = parsed.data;

	// Resolve the active Notion connection for this org (+ optional workspace).
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "notion"),
			workspaceId
				? eq(integrationConnections.workspaceId, workspaceId)
				: isNull(integrationConnections.workspaceId),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return Response.json({
			success: true,
			skipped: true,
			reason: "No Notion connection or connection disconnected",
		});
	}

	let token: string;
	try {
		token = decodeSecret(connection.accessToken);
	} catch {
		// Token can't be decoded — nothing actionable; ack so QStash stops retrying.
		console.warn(
			`[notion-sync] failed to decode access token for org ${organizationId}`,
		);
		return Response.json({
			success: true,
			skipped: true,
			reason: "Could not decode Notion access token",
		});
	}

	const importBatchId = crypto.randomUUID();
	const imported = await importNotionPages({
		token,
		organizationId,
		importBatchId,
		query,
	});

	if (imported === 0) {
		console.info(
			`[notion-sync] no pages mapped for org ${organizationId} (batch ${importBatchId})`,
		);
		return Response.json({ success: true, imported: 0, importBatchId });
	}

	return Response.json({ success: true, imported, importBatchId });
}

/**
 * Pages through `/search`, maps each page to a knowledge document, and upserts
 * in batches. Returns the number of mapped rows written.
 */
async function importNotionPages({
	token,
	organizationId,
	importBatchId,
	query,
}: {
	token: string;
	organizationId: string;
	importBatchId: string;
	query: string | undefined;
}): Promise<number> {
	let cursor: string | undefined;
	let pagesWalked = 0;
	let totalImported = 0;

	do {
		const response = await search({
			token,
			query,
			startCursor: cursor,
		});

		const docs = mapNotionPages(response.results, {
			organizationId,
			importBatchId,
			markdownByPageId: await fetchMarkdownByPageId({
				token,
				pages: response.results,
			}),
		});

		for (const batch of chunk(docs, BATCH_SIZE)) {
			if (batch.length === 0) continue;
			await db
				.insert(knowledgeDocuments)
				.values(batch)
				.onConflictDoUpdate({
					target: [knowledgeDocuments.organizationId, knowledgeDocuments.slug],
					set: {
						...buildConflictUpdateColumns(knowledgeDocuments, [
							"title",
							"markdown",
						]),
						updatedAt: new Date(),
					},
				});
			totalImported += batch.length;
		}

		cursor = response.has_more
			? (response.next_cursor ?? undefined)
			: undefined;
		pagesWalked += 1;
	} while (cursor && pagesWalked < MAX_PAGES);

	return totalImported;
}

async function fetchMarkdownByPageId({
	token,
	pages,
}: {
	token: string;
	pages: readonly NotionSearchResult[];
}): Promise<Map<string, string>> {
	const markdownByPageId = new Map<string, string>();

	for (const page of pages) {
		try {
			const blocks = await fetchBlockTree({
				token,
				blockId: page.id,
				depth: 0,
			});
			markdownByPageId.set(page.id, renderNotionBlocksToMarkdown(blocks));
		} catch (error) {
			console.warn(
				`[notion-sync] failed to import blocks for page ${page.id}`,
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
			markdownByPageId.set(page.id, "");
		}
	}

	return markdownByPageId;
}

async function fetchBlockTree({
	token,
	blockId,
	depth,
}: {
	token: string;
	blockId: string;
	depth: number;
}): Promise<NotionBlock[]> {
	if (depth > MAX_BLOCK_DEPTH) return [];

	let cursor: string | undefined;
	let pagesWalked = 0;
	const blocks: NotionBlock[] = [];

	do {
		const response = await listBlockChildren({
			token,
			blockId,
			startCursor: cursor,
		});

		for (const block of response.results) {
			const next = { ...block };
			if (block.has_children) {
				next.children = await fetchBlockTree({
					token,
					blockId: block.id,
					depth: depth + 1,
				});
			}
			blocks.push(next);
		}

		cursor = response.has_more
			? (response.next_cursor ?? undefined)
			: undefined;
		pagesWalked += 1;
	} while (cursor && pagesWalked < MAX_BLOCK_PAGES_PER_LEVEL);

	return blocks;
}
