import { dbWs } from "@rox/db/client";
import { knowledgeDocuments } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import {
	resolveIncomingLinks,
	syncOutgoingLinks,
} from "../../knowledge/backlinks";
import { createProviderConnectionRouter } from "../shared/provider-router";
import { verifyOrgAdmin } from "../utils";
import { parseObsidianNote } from "./parse-note";

/**
 * A single vault file pushed by the host-service. The host reads local Obsidian
 * vault files off disk; this mutation does the pure parse + DB upsert. Bodies are
 * bounded so a runaway file can't blow up the request.
 */
const importNoteSchema = z.object({
	path: z.string().trim().min(1).max(1024),
	content: z.string().max(1_000_000),
});

const importNotesInput = z.object({
	organizationId: z.uuid(),
	workspaceId: z.uuid().nullish(),
	notes: z.array(importNoteSchema).max(1000),
});

const baseRouter = createProviderConnectionRouter("obsidian");

export const obsidianRouter = {
	...baseRouter,

	/**
	 * Import a batch of parsed Obsidian notes into `knowledge_documents`.
	 *
	 * Obsidian is a LOCAL vault (no cloud webhook): the host-service reads vault
	 * files and calls this with `{ path, content }[]`. Each note is parsed (pure,
	 * never throws) and upserted on the unique `(organization_id, slug)` index, so
	 * re-importing the same vault file updates the existing document in place. The
	 * import runs in one transaction and also materializes `[[wikilink]]`
	 * backlinks via the shared knowledge helpers, keeping Obsidian imports
	 * consistent with manually-authored notes.
	 */
	importNotes: protectedProcedure
		.input(importNotesInput)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const { organizationId } = input;
			if (input.notes.length === 0) {
				return { imported: 0 };
			}

			const imported = await dbWs.transaction(async (tx) => {
				let count = 0;
				for (const note of input.notes) {
					const parsed = parseObsidianNote(note, { organizationId });

					const [doc] = await tx
						.insert(knowledgeDocuments)
						.values({
							organizationId,
							sourceKind: "obsidian_import",
							slug: parsed.slug,
							title: parsed.title,
							markdown: parsed.markdown,
							frontmatter: parsed.frontmatter,
							tags: parsed.tags,
							sourceRef: parsed.sourceRef,
							createdByUserId: ctx.session.user.id,
						})
						.onConflictDoUpdate({
							target: [
								knowledgeDocuments.organizationId,
								knowledgeDocuments.slug,
							],
							set: {
								title: parsed.title,
								markdown: parsed.markdown,
								frontmatter: parsed.frontmatter,
								tags: parsed.tags,
								sourceRef: parsed.sourceRef,
								sourceKind: "obsidian_import",
								updatedAt: new Date(),
							},
						})
						.returning({
							id: knowledgeDocuments.id,
							slug: knowledgeDocuments.slug,
						});

					if (!doc) continue;
					count += 1;

					// Materialize outgoing [[wikilinks]] for this note, then light up
					// any previously-unresolved links that now point at it.
					await syncOutgoingLinks(tx, {
						organizationId,
						sourceDocumentId: doc.id,
						markdown: parsed.markdown,
					});
					await resolveIncomingLinks(tx, {
						organizationId,
						documentId: doc.id,
						slug: doc.slug,
					});
				}
				return count;
			});

			return { imported };
		}),
} satisfies TRPCRouterRecord;
