/**
 * Knowledge-document-backed note storage (N2 migration).
 *
 * Per the D7 spec + owner decision (2026-06-23), a note's CONTENT is a
 * `knowledge_documents` row of `type='note'` — NOT the legacy `note_notes`
 * markdown column. This module is the storage seam: the notebooks router stays
 * API-compatible (same `note_notes`-shaped output) while content read/write +
 * backlinks (`knowledge_links`) flow through the knowledge engine.
 *
 * `note_notes` is retained as a thin, stable INDEX row (id, publish slug, owner
 * scope) that always points at its backing doc via `knowledge_document_id`.
 * Legacy / not-yet-backfilled rows (null `knowledge_document_id`) fall back to
 * the inline `note_notes.markdown` so existing notes keep rendering during the
 * transition.
 */

import { randomBytes } from "node:crypto";
import { knowledgeDocuments } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import type { KnowledgeTx } from "../knowledge/backlinks";
import { syncOutgoingLinks } from "../knowledge/backlinks";

/** Generate a kebab-case slug that satisfies `knowledgeSlugSchema`. */
export function createKnowledgeNoteSlug(): string {
	// base36 of random bytes → only [a-z0-9]; prefixed so it never starts with a
	// digit-only token that could look like an id elsewhere.
	const rand = BigInt(`0x${randomBytes(9).toString("hex")}`).toString(36);
	return `note-${rand}`;
}

type DocRow = typeof knowledgeDocuments.$inferSelect;

/**
 * Create the backing `knowledge_documents` row for a note + materialize its
 * outgoing `[[wikilinks]]`. Returns the created doc. Must run inside a `dbWs`
 * transaction (so the doc + its links commit atomically).
 */
export async function createNoteDocument(
	tx: KnowledgeTx,
	params: {
		organizationId: string;
		createdByUserId: string;
		title: string;
		markdown: string;
		tags: string[];
		v2ProjectId?: string | null;
	},
): Promise<DocRow> {
	const slug = createKnowledgeNoteSlug();
	const [doc] = await tx
		.insert(knowledgeDocuments)
		.values({
			organizationId: params.organizationId,
			v2ProjectId: params.v2ProjectId ?? null,
			type: "note",
			sourceKind: "manual",
			slug,
			title: params.title,
			markdown: params.markdown,
			tags: params.tags,
			createdByUserId: params.createdByUserId,
		})
		.returning();
	if (!doc) {
		throw new Error("Failed to create backing knowledge document for note");
	}
	await syncOutgoingLinks(tx, {
		organizationId: params.organizationId,
		sourceDocumentId: doc.id,
		markdown: doc.markdown,
	});
	return doc;
}

/**
 * Update the backing doc's content fields. Only provided fields are written.
 * Re-syncs backlinks whenever markdown changes. Must run inside a transaction.
 */
export async function updateNoteDocument(
	tx: KnowledgeTx,
	params: {
		organizationId: string;
		documentId: string;
		title?: string;
		markdown?: string;
		tags?: string[];
	},
): Promise<DocRow | undefined> {
	const set: Partial<typeof knowledgeDocuments.$inferInsert> = {};
	if (params.title !== undefined) set.title = params.title;
	if (params.markdown !== undefined) set.markdown = params.markdown;
	if (params.tags !== undefined) set.tags = params.tags;

	if (Object.keys(set).length === 0) return undefined;

	const [doc] = await tx
		.update(knowledgeDocuments)
		.set(set)
		.where(
			and(
				eq(knowledgeDocuments.id, params.documentId),
				eq(knowledgeDocuments.organizationId, params.organizationId),
			),
		)
		.returning();

	if (doc && params.markdown !== undefined) {
		await syncOutgoingLinks(tx, {
			organizationId: params.organizationId,
			sourceDocumentId: doc.id,
			markdown: doc.markdown,
		});
	}
	return doc;
}
