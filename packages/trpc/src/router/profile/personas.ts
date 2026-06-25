import { db } from "@rox/db/client";
import { activePersonas, agentPersonas } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createPersonaSchema,
	defaultPersonaAccent,
	personaIdSchema,
	updatePersonaSchema,
} from "./personas-schema";

/**
 * Agent-persona CRUD router (Hermes-borrow F21) — the persona half of the
 * dual-identity card.
 *
 * CRUD over `agent_personas` plus the cross-device active-persona pointer
 * (`active_personas`, micro-decision #2). Every procedure is org-scoped via
 * `requireActiveOrgMembership` and additionally owner-scoped, so a user only
 * sees and mutates their own personas, and never another org's. On create with
 * no accent the colour defaults to the deterministic auto-accent
 * (`identityGlyph(displayName).background`). This is the identity axis only —
 * never the `chat_labels` organization axis (tags ⟂ identity).
 */

async function getPersonaForOwner(
	organizationId: string,
	ownerUserId: string,
	personaId: string,
) {
	const [row] = await db
		.select()
		.from(agentPersonas)
		.where(
			and(
				eq(agentPersonas.id, personaId),
				eq(agentPersonas.organizationId, organizationId),
				eq(agentPersonas.ownerUserId, ownerUserId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
	}
	return row;
}

export const personasRouter = {
	/** The caller's personas in the active org, name-sorted. */
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select()
			.from(agentPersonas)
			.where(
				and(
					eq(agentPersonas.organizationId, organizationId),
					eq(agentPersonas.ownerUserId, ctx.session.user.id),
				),
			)
			.orderBy(asc(agentPersonas.displayName));
	}),

	/** The caller's active persona row in the active org (or `null`). */
	getActive: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const [pointer] = await db
			.select()
			.from(activePersonas)
			.where(
				and(
					eq(activePersonas.userId, ctx.session.user.id),
					eq(activePersonas.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!pointer) {
			return null;
		}
		const [persona] = await db
			.select()
			.from(agentPersonas)
			.where(eq(agentPersonas.id, pointer.personaId))
			.limit(1);
		return persona ?? null;
	}),

	create: protectedProcedure
		.input(createPersonaSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			try {
				const [row] = await db
					.insert(agentPersonas)
					.values({
						organizationId,
						ownerUserId: ctx.session.user.id,
						displayName: input.displayName,
						avatarUrl: input.avatarUrl ?? null,
						handle: input.handle ?? null,
						accentColor:
							input.accentColor ?? defaultPersonaAccent(input.displayName),
						themeJson: input.theme ?? null,
					})
					.returning();
				return row;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A persona with this handle already exists",
					});
				}
				throw error;
			}
		}),

	update: protectedProcedure
		.input(updatePersonaSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaForOwner(
				organizationId,
				ctx.session.user.id,
				input.personaId,
			);

			const updates: Partial<typeof agentPersonas.$inferInsert> = {};
			if (input.displayName !== undefined) {
				updates.displayName = input.displayName;
			}
			if (input.avatarUrl !== undefined) {
				updates.avatarUrl = input.avatarUrl;
			}
			if (input.handle !== undefined) {
				updates.handle = input.handle;
			}
			if (input.accentColor !== undefined) {
				updates.accentColor = input.accentColor;
			}
			if (input.theme !== undefined) {
				updates.themeJson = input.theme;
			}

			if (Object.keys(updates).length === 0) {
				return getPersonaForOwner(
					organizationId,
					ctx.session.user.id,
					input.personaId,
				);
			}

			try {
				const [row] = await db
					.update(agentPersonas)
					.set(updates)
					.where(
						and(
							eq(agentPersonas.id, input.personaId),
							eq(agentPersonas.organizationId, organizationId),
							eq(agentPersonas.ownerUserId, ctx.session.user.id),
						),
					)
					.returning();
				return row;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A persona with this handle already exists",
					});
				}
				throw error;
			}
		}),

	delete: protectedProcedure
		.input(personaIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaForOwner(
				organizationId,
				ctx.session.user.id,
				input.personaId,
			);
			// The active-persona pointer cascades on persona delete (composite FK).
			await db
				.delete(agentPersonas)
				.where(
					and(
						eq(agentPersonas.id, input.personaId),
						eq(agentPersonas.organizationId, organizationId),
						eq(agentPersonas.ownerUserId, ctx.session.user.id),
					),
				);
			return { ok: true as const };
		}),

	/**
	 * Point the caller's active persona (in the active org) at `personaId`.
	 * Cross-device: the pointer is per `(user, organization)`, so switching
	 * device keeps the same active persona (micro-decision #2). Upsert on the
	 * `(user, org)` unique key.
	 */
	setActive: protectedProcedure
		.input(personaIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Verify ownership before pointing at it (also rejects cross-org).
			await getPersonaForOwner(
				organizationId,
				ctx.session.user.id,
				input.personaId,
			);
			const [row] = await db
				.insert(activePersonas)
				.values({
					userId: ctx.session.user.id,
					organizationId,
					personaId: input.personaId,
				})
				.onConflictDoUpdate({
					target: [activePersonas.userId, activePersonas.organizationId],
					set: { personaId: input.personaId },
				})
				.returning();
			return row;
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
