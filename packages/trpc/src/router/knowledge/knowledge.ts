import { db, dbWs } from "@rox/db/client";
import {
	knowledgeDocuments,
	knowledgeLinks,
	type SelectKnowledgeDocument,
} from "@rox/db/schema";
import { assertMdxSafe, type KnowledgeBacklink } from "@rox/shared/knowledge";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { resolveIncomingLinks, syncOutgoingLinks } from "./backlinks";
import {
	backlinksSchema,
	createKnowledgeSchema,
	getKnowledgeSchema,
	knowledgeIdSchema,
	listKnowledgeSchema,
	searchKnowledgeSchema,
	updateKnowledgeSchema,
} from "./schema";

async function getDocForOrg(
	organizationId: string,
	where: { id?: string; slug?: string },
): Promise<SelectKnowledgeDocument> {
	const condition = where.id
		? eq(knowledgeDocuments.id, where.id)
		: eq(knowledgeDocuments.slug, where.slug ?? "");
	const [row] = await db
		.select()
		.from(knowledgeDocuments)
		.where(
			and(eq(knowledgeDocuments.organizationId, organizationId), condition),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Knowledge document not found",
		});
	}
	return row;
}

export const knowledgeRouter = {
	list: protectedProcedure
		.input(listKnowledgeSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(knowledgeDocuments.organizationId, organizationId),
			];
			if (input?.type) conditions.push(eq(knowledgeDocuments.type, input.type));
			if (input?.v2ProjectId) {
				conditions.push(eq(knowledgeDocuments.v2ProjectId, input.v2ProjectId));
			}
			if (input?.tag) {
				conditions.push(
					sql`${knowledgeDocuments.tags} @> ${JSON.stringify([input.tag])}::jsonb`,
				);
			}
			return db
				.select()
				.from(knowledgeDocuments)
				.where(and(...conditions))
				.orderBy(desc(knowledgeDocuments.updatedAt));
		}),

	get: protectedProcedure
		.input(getKnowledgeSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getDocForOrg(organizationId, { slug: input.slug });
		}),

	search: protectedProcedure
		.input(searchKnowledgeSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const term = `%${input.query}%`;
			const conditions = [
				eq(knowledgeDocuments.organizationId, organizationId),
				or(
					ilike(knowledgeDocuments.title, term),
					ilike(knowledgeDocuments.markdown, term),
				),
			];
			if (input.type) conditions.push(eq(knowledgeDocuments.type, input.type));
			if (input.v2ProjectId) {
				conditions.push(eq(knowledgeDocuments.v2ProjectId, input.v2ProjectId));
			}
			if (input.tag) {
				conditions.push(
					sql`${knowledgeDocuments.tags} @> ${JSON.stringify([input.tag])}::jsonb`,
				);
			}
			return db
				.select()
				.from(knowledgeDocuments)
				.where(and(...conditions))
				.orderBy(desc(knowledgeDocuments.updatedAt))
				.limit(input.limit);
		}),

	create: protectedProcedure
		.input(createKnowledgeSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			if (input.markdown) assertMdxSafe(input.markdown);

			return dbWs.transaction(async (tx) => {
				const [doc] = await tx
					.insert(knowledgeDocuments)
					.values({
						organizationId,
						v2ProjectId: input.v2ProjectId ?? null,
						type: input.type,
						sourceKind: input.sourceKind,
						slug: input.slug,
						title: input.title,
						markdown: input.markdown ?? null,
						frontmatter: input.frontmatter ?? null,
						body: input.body ?? null,
						tags: input.tags,
						sourceRef: input.sourceRef ?? null,
						createdByUserId: ctx.session.user.id,
					})
					.returning();
				if (!doc) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				await syncOutgoingLinks(tx, {
					organizationId,
					sourceDocumentId: doc.id,
					markdown: doc.markdown,
				});
				await resolveIncomingLinks(tx, {
					organizationId,
					documentId: doc.id,
					slug: doc.slug,
				});
				return doc;
			});
		}),

	update: protectedProcedure
		.input(updateKnowledgeSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await getDocForOrg(organizationId, { id: input.id });
			if (input.markdown !== undefined && input.markdown) {
				assertMdxSafe(input.markdown);
			}

			return dbWs.transaction(async (tx) => {
				const [doc] = await tx
					.update(knowledgeDocuments)
					.set({
						type: input.type ?? existing.type,
						slug: input.slug ?? existing.slug,
						title: input.title ?? existing.title,
						markdown:
							input.markdown !== undefined ? input.markdown : existing.markdown,
						frontmatter: input.frontmatter ?? existing.frontmatter,
						body: input.body ?? existing.body,
						tags: input.tags ?? existing.tags,
						v2ProjectId:
							input.v2ProjectId !== undefined
								? input.v2ProjectId
								: existing.v2ProjectId,
					})
					.where(
						and(
							eq(knowledgeDocuments.id, input.id),
							eq(knowledgeDocuments.organizationId, organizationId),
						),
					)
					.returning();
				if (!doc) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				if (input.markdown !== undefined) {
					await syncOutgoingLinks(tx, {
						organizationId,
						sourceDocumentId: doc.id,
						markdown: doc.markdown,
					});
				}
				if (input.slug && input.slug !== existing.slug) {
					await resolveIncomingLinks(tx, {
						organizationId,
						documentId: doc.id,
						slug: doc.slug,
					});
				}
				return doc;
			});
		}),

	delete: protectedProcedure
		.input(knowledgeIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getDocForOrg(organizationId, { id: input.id });
			await db
				.delete(knowledgeDocuments)
				.where(
					and(
						eq(knowledgeDocuments.id, input.id),
						eq(knowledgeDocuments.organizationId, organizationId),
					),
				);
			return { id: input.id };
		}),

	backlinks: protectedProcedure
		.input(backlinksSchema)
		.query(async ({ ctx, input }): Promise<KnowledgeBacklink[]> => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rows = await db
				.select({
					sourceDocumentId: knowledgeLinks.sourceDocumentId,
					resolved: knowledgeLinks.resolved,
					sourceSlug: knowledgeDocuments.slug,
					sourceTitle: knowledgeDocuments.title,
				})
				.from(knowledgeLinks)
				.innerJoin(
					knowledgeDocuments,
					eq(knowledgeLinks.sourceDocumentId, knowledgeDocuments.id),
				)
				.where(
					and(
						eq(knowledgeLinks.organizationId, organizationId),
						eq(knowledgeLinks.targetSlug, input.slug),
					),
				)
				.orderBy(desc(knowledgeDocuments.updatedAt));

			return rows.map((r) => ({
				sourceDocumentId: r.sourceDocumentId,
				sourceSlug: r.sourceSlug,
				sourceTitle: r.sourceTitle,
				resolved: r.resolved,
			}));
		}),
} satisfies TRPCRouterRecord;
