/**
 * Backlink materialization for knowledge documents.
 *
 * On every write we re-parse the source document's `[[wikilinks]]`, then replace
 * its `knowledge_links` rows. Each link is resolved against existing documents
 * in the same org (kebab slug match); unresolved targets are still recorded so a
 * later-created document can be back-filled.
 */

import type { dbWs } from "@rox/db/client";
import { knowledgeDocuments, knowledgeLinks } from "@rox/db/schema";
import { extractWikiLinkTargets } from "@rox/shared/knowledge";
import { and, eq, inArray } from "drizzle-orm";

/** The transaction handle passed to `dbWs.transaction(async (tx) => …)`. */
export type KnowledgeTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

type Tx = KnowledgeTx;

/**
 * Replace the outgoing `knowledge_links` for a source document based on the
 * wikilinks found in `markdown`.
 */
export async function syncOutgoingLinks(
	tx: Tx,
	params: {
		organizationId: string;
		sourceDocumentId: string;
		markdown: string | null | undefined;
	},
): Promise<void> {
	const { organizationId, sourceDocumentId } = params;
	const targets = extractWikiLinkTargets(params.markdown ?? "");

	// Drop existing outgoing links for this document.
	await tx
		.delete(knowledgeLinks)
		.where(eq(knowledgeLinks.sourceDocumentId, sourceDocumentId));

	if (targets.length === 0) return;

	// Resolve targets that already exist in this org.
	const existing = await tx
		.select({
			id: knowledgeDocuments.id,
			slug: knowledgeDocuments.slug,
		})
		.from(knowledgeDocuments)
		.where(
			and(
				eq(knowledgeDocuments.organizationId, organizationId),
				inArray(knowledgeDocuments.slug, targets),
			),
		);
	const bySlug = new Map(existing.map((d) => [d.slug, d.id]));

	await tx.insert(knowledgeLinks).values(
		targets.map((targetSlug) => {
			const targetDocumentId = bySlug.get(targetSlug) ?? null;
			return {
				organizationId,
				sourceDocumentId,
				targetSlug,
				targetDocumentId,
				resolved: targetDocumentId !== null,
			};
		}),
	);
}

/**
 * Back-fill previously-unresolved links that now point at `doc` (called after a
 * document is created/renamed so existing references light up).
 */
export async function resolveIncomingLinks(
	tx: Tx,
	params: { organizationId: string; documentId: string; slug: string },
): Promise<void> {
	await tx
		.update(knowledgeLinks)
		.set({ targetDocumentId: params.documentId, resolved: true })
		.where(
			and(
				eq(knowledgeLinks.organizationId, params.organizationId),
				eq(knowledgeLinks.targetSlug, params.slug),
			),
		);
}
