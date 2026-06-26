import { db } from "@rox/db/client";
import { chatLabels } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createLabelSchema,
	defaultLabelColor,
	labelIdSchema,
	updateLabelSchema,
} from "./labels-schema";

/**
 * Org chat-label registry router (Hermes-borrow F11).
 *
 * CRUD over `chat_labels` — the org-scoped colour/icon registry for the label
 * names referenced by `chat_sessions.labels`. Every procedure is org-scoped via
 * `requireActiveOrgMembership` (the skill-library pattern) and constrains all
 * statements by `organizationId`, so an org can never read or mutate another
 * org's labels. On create with no colour, the colour defaults to the
 * deterministic auto-colour (`identityGlyph(name).background`). This is the
 * organization axis only — never identity (tags ⟂ identity).
 */

async function getLabelForOrg(organizationId: string, labelId: string) {
	const [row] = await db
		.select()
		.from(chatLabels)
		.where(
			and(
				eq(chatLabels.id, labelId),
				eq(chatLabels.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Chat label not found" });
	}
	return row;
}

export const chatLabelsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select()
			.from(chatLabels)
			.where(eq(chatLabels.organizationId, organizationId))
			.orderBy(asc(chatLabels.name));
	}),

	create: protectedProcedure
		.input(createLabelSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			try {
				const [row] = await db
					.insert(chatLabels)
					.values({
						organizationId,
						name: input.name,
						// Default to the deterministic auto-colour when none supplied.
						color: input.color ?? defaultLabelColor(input.name),
						icon: input.icon ?? null,
						createdBy: ctx.session.user.id,
					})
					.returning();
				return row;
			} catch (error) {
				// `(organization_id, name)` is unique — surface a clear conflict.
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A label with this name already exists",
					});
				}
				throw error;
			}
		}),

	update: protectedProcedure
		.input(updateLabelSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLabelForOrg(organizationId, input.labelId);

			const updates: Partial<typeof chatLabels.$inferInsert> = {};
			if (input.name !== undefined) {
				updates.name = input.name;
			}
			if (input.color !== undefined) {
				updates.color = input.color;
			}
			if (input.icon !== undefined) {
				updates.icon = input.icon;
			}

			if (Object.keys(updates).length === 0) {
				return getLabelForOrg(organizationId, input.labelId);
			}

			try {
				const [row] = await db
					.update(chatLabels)
					.set(updates)
					.where(
						and(
							eq(chatLabels.id, input.labelId),
							eq(chatLabels.organizationId, organizationId),
						),
					)
					.returning();
				return row;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A label with this name already exists",
					});
				}
				throw error;
			}
		}),

	delete: protectedProcedure
		.input(labelIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLabelForOrg(organizationId, input.labelId);
			await db
				.delete(chatLabels)
				.where(
					and(
						eq(chatLabels.id, input.labelId),
						eq(chatLabels.organizationId, organizationId),
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
