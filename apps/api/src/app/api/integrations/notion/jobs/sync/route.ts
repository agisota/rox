/**
 * QStash job: import Notion pages into `knowledge_documents`.
 *
 * Mirrors the Linear `initial-sync` job structure: verify the QStash signature
 * (skipped in dev, where QStash can't reach localhost), resolve the active
 * Notion connection, decode its token, page through `POST /search`, map each
 * page to a knowledge document, and upsert with `onConflictDoUpdate` keyed on
 * the unique `(organizationId, slug)` index.
 *
 * Foundation scope: pages are imported with empty `markdown` (block → markdown
 * conversion is a TODO in ./sync). The route always returns 200 + typechecks;
 * a missing/disconnected connection or an empty result set is logged and 200ed
 * so QStash does not retry a non-actionable job.
 */

import { buildConflictUpdateColumns, db } from "@rox/db";
import { integrationConnections, knowledgeDocuments } from "@rox/db/schema";
import { decodeSecret } from "@rox/trpc/integration-secret";
import { Receiver } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";
import chunk from "lodash.chunk";
import { z } from "zod";
import { env } from "@/env";
import { search } from "../../notion-client";
import { mapNotionPages } from "../../sync";

/** Insert chunk size — keeps each upsert statement within sane bounds. */
const BATCH_SIZE = 100;

/** Safety cap on `/search` pagination so one job can't loop unbounded. */
const MAX_PAGES = 50;

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
