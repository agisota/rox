import { db } from "@rox/db/client";
import { chatSavedViews } from "@rox/db/schema";
import { identityGlyph } from "@rox/shared/identity-glyph";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createSavedViewSchema,
	savedViewIdSchema,
	updateSavedViewSchema,
} from "./saved-views-schema";

/**
 * Org chat Saved-Views registry router (Hermes-borrow F17).
 *
 * CRUD over `chat_saved_views` — the org-scoped registry of named boolean tag
 * filters (`SavedViewRule` jsonb) over the chat list. Every procedure is
 * org-scoped via `requireActiveOrgMembership` (the chat-labels / skill-library
 * pattern) and constrains all statements by `organizationId`, so an org can
 * never read or mutate another org's views. Built-in Smart Folders are fixed
 * presets in the shared core and are NOT stored here.
 */

async function getSavedViewForOrg(organizationId: string, savedViewId: string) {
	const [row] = await db
		.select()
		.from(chatSavedViews)
		.where(
			and(
				eq(chatSavedViews.id, savedViewId),
				eq(chatSavedViews.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Saved view not found",
		});
	}
	return row;
}

export const chatSavedViewsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select()
			.from(chatSavedViews)
			.where(eq(chatSavedViews.organizationId, organizationId))
			.orderBy(asc(chatSavedViews.name));
	}),

	create: protectedProcedure
		.input(createSavedViewSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			try {
				const [row] = await db
					.insert(chatSavedViews)
					.values({
						organizationId,
						name: input.name,
						rule: input.rule ?? {},
						// Default to the deterministic auto-colour when none supplied
						// (the `chat_labels.color` convention).
						color: input.color ?? identityGlyph(input.name).background,
						createdBy: ctx.session.user.id,
					})
					.returning();
				return row;
			} catch (error) {
				// `(organization_id, name)` is unique — surface a clear conflict.
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A saved view with this name already exists",
					});
				}
				throw error;
			}
		}),

	update: protectedProcedure
		.input(updateSavedViewSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSavedViewForOrg(organizationId, input.savedViewId);

			const updates: Partial<typeof chatSavedViews.$inferInsert> = {};
			if (input.name !== undefined) {
				updates.name = input.name;
			}
			if (input.rule !== undefined) {
				updates.rule = input.rule;
			}
			if (input.color !== undefined) {
				updates.color = input.color;
			}

			if (Object.keys(updates).length === 0) {
				return getSavedViewForOrg(organizationId, input.savedViewId);
			}

			try {
				const [row] = await db
					.update(chatSavedViews)
					.set(updates)
					.where(
						and(
							eq(chatSavedViews.id, input.savedViewId),
							eq(chatSavedViews.organizationId, organizationId),
						),
					)
					.returning();
				return row;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A saved view with this name already exists",
					});
				}
				throw error;
			}
		}),

	delete: protectedProcedure
		.input(savedViewIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSavedViewForOrg(organizationId, input.savedViewId);
			await db
				.delete(chatSavedViews)
				.where(
					and(
						eq(chatSavedViews.id, input.savedViewId),
						eq(chatSavedViews.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;

/** Postgres unique-violation SQLSTATE (`23505`), as surfaced by the pg driver. */
function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "23505"
	);
}
