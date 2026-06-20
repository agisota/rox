import { db } from "@rox/db/client";
import {
	dashboardEntries,
	dashboardSections,
	dashboards,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createDashboardSchema,
	createEntrySchema,
	createSectionSchema,
	dashboardIdSchema,
	deleteEntrySchema,
	deleteSectionSchema,
	listDashboardsSchema,
	updateDashboardSchema,
	updateEntrySchema,
	updateSectionSchema,
} from "./schema";

/**
 * Collaborative org dashboard router (WS-J §2.2 P1, T3).
 *
 * Every procedure is org-scoped via `requireActiveOrgMembership` (the skill
 * router pattern, NOT agentSource verifyOrgMembership) and constrains all
 * statements by `organizationId`. Sections and entries denormalize
 * `organization_id` (and entries also `dashboard_id`) on write so the rows match
 * the schema's ElectricSQL shape-filter contract; child writes resolve those ids
 * from the verified parent, never from the caller.
 */

async function getDashboardForOrg(organizationId: string, dashboardId: string) {
	const [row] = await db
		.select()
		.from(dashboards)
		.where(
			and(
				eq(dashboards.id, dashboardId),
				eq(dashboards.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
	}
	return row;
}

async function getSectionForOrg(organizationId: string, sectionId: string) {
	const [row] = await db
		.select()
		.from(dashboardSections)
		.where(
			and(
				eq(dashboardSections.id, sectionId),
				eq(dashboardSections.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Dashboard section not found",
		});
	}
	return row;
}

async function getEntryForOrg(organizationId: string, entryId: string) {
	const [row] = await db
		.select()
		.from(dashboardEntries)
		.where(
			and(
				eq(dashboardEntries.id, entryId),
				eq(dashboardEntries.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Dashboard entry not found",
		});
	}
	return row;
}

export const dashboardRouter = {
	list: protectedProcedure
		.input(listDashboardsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [eq(dashboards.organizationId, organizationId)];
			if (input?.v2ProjectId) {
				conditions.push(eq(dashboards.v2ProjectId, input.v2ProjectId));
			}
			return db
				.select()
				.from(dashboards)
				.where(and(...conditions))
				.orderBy(desc(dashboards.updatedAt));
		}),

	get: protectedProcedure
		.input(dashboardIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const dashboard = await getDashboardForOrg(
				organizationId,
				input.dashboardId,
			);
			const sections = await db
				.select()
				.from(dashboardSections)
				.where(eq(dashboardSections.dashboardId, dashboard.id))
				.orderBy(asc(dashboardSections.position));
			const entries = await db
				.select()
				.from(dashboardEntries)
				.where(eq(dashboardEntries.dashboardId, dashboard.id))
				.orderBy(asc(dashboardEntries.position));
			return { dashboard, sections, entries };
		}),

	create: protectedProcedure
		.input(createDashboardSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [row] = await db
				.insert(dashboards)
				.values({
					organizationId,
					v2ProjectId: input.v2ProjectId ?? null,
					slug: input.slug,
					name: input.name,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return row;
		}),

	update: protectedProcedure
		.input(updateDashboardSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getDashboardForOrg(organizationId, input.dashboardId);
			const [row] = await db
				.update(dashboards)
				.set({ name: input.name })
				.where(
					and(
						eq(dashboards.id, input.dashboardId),
						eq(dashboards.organizationId, organizationId),
					),
				)
				.returning();
			return row;
		}),

	delete: protectedProcedure
		.input(dashboardIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getDashboardForOrg(organizationId, input.dashboardId);
			await db
				.delete(dashboards)
				.where(
					and(
						eq(dashboards.id, input.dashboardId),
						eq(dashboards.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	createSection: protectedProcedure
		.input(createSectionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const dashboard = await getDashboardForOrg(
				organizationId,
				input.dashboardId,
			);
			const [row] = await db
				.insert(dashboardSections)
				.values({
					dashboardId: dashboard.id,
					organizationId,
					kind: input.kind,
					title: input.title ?? null,
					position: input.position ?? 0,
				})
				.returning();
			return row;
		}),

	updateSection: protectedProcedure
		.input(updateSectionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSectionForOrg(organizationId, input.sectionId);
			const [row] = await db
				.update(dashboardSections)
				.set({
					...(input.title !== undefined ? { title: input.title } : {}),
					...(input.position !== undefined ? { position: input.position } : {}),
				})
				.where(
					and(
						eq(dashboardSections.id, input.sectionId),
						eq(dashboardSections.organizationId, organizationId),
					),
				)
				.returning();
			return row;
		}),

	deleteSection: protectedProcedure
		.input(deleteSectionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSectionForOrg(organizationId, input.sectionId);
			await db
				.delete(dashboardSections)
				.where(
					and(
						eq(dashboardSections.id, input.sectionId),
						eq(dashboardSections.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	createEntry: protectedProcedure
		.input(createEntrySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const section = await getSectionForOrg(organizationId, input.sectionId);
			const [row] = await db
				.insert(dashboardEntries)
				.values({
					sectionId: section.id,
					dashboardId: section.dashboardId,
					organizationId,
					body: input.body ?? null,
					knowledgeDocumentId: input.knowledgeDocumentId ?? null,
					status: input.status ?? null,
					priority: input.priority ?? null,
					position: input.position ?? 0,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return row;
		}),

	updateEntry: protectedProcedure
		.input(updateEntrySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getEntryForOrg(organizationId, input.entryId);
			const [row] = await db
				.update(dashboardEntries)
				.set({
					...(input.body !== undefined ? { body: input.body } : {}),
					...(input.knowledgeDocumentId !== undefined
						? { knowledgeDocumentId: input.knowledgeDocumentId }
						: {}),
					...(input.status !== undefined ? { status: input.status } : {}),
					...(input.priority !== undefined ? { priority: input.priority } : {}),
					...(input.position !== undefined ? { position: input.position } : {}),
				})
				.where(
					and(
						eq(dashboardEntries.id, input.entryId),
						eq(dashboardEntries.organizationId, organizationId),
					),
				)
				.returning();
			return row;
		}),

	deleteEntry: protectedProcedure
		.input(deleteEntrySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getEntryForOrg(organizationId, input.entryId);
			await db
				.delete(dashboardEntries)
				.where(
					and(
						eq(dashboardEntries.id, input.entryId),
						eq(dashboardEntries.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
