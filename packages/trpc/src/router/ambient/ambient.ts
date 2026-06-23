import { db, dbWs } from "@rox/db/client";
import { userAmbientSettings } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

/**
 * Ambient agent settings (ambient-intelligence epic, phase 4b, "Act").
 *
 * The org+user-scoped server consent for the proactive ambient assistant. The
 * desktop also has a LOCAL phase-4a flag, but the server `*\/5` nudge job runs
 * when the desktop is closed and can only see THIS row, so the toggle here is
 * what actually gates server-side nudges. OFF by default (opt-in).
 *
 * Writes return the post-commit Electric txid so the desktop collection can
 * await its own mutation (mirrors the memory router).
 */
export const ambientRouter = {
	/** Read the signed-in user's ambient settings (defaults when no row yet). */
	get: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const [row] = await db
			.select({
				ambientEnabled: userAmbientSettings.ambientEnabled,
				voiceAgentContext: userAmbientSettings.voiceAgentContext,
			})
			.from(userAmbientSettings)
			.where(
				and(
					eq(userAmbientSettings.organizationId, organizationId),
					eq(userAmbientSettings.createdBy, ctx.session.user.id),
				),
			)
			.limit(1);
		return {
			ambientEnabled: row?.ambientEnabled ?? false,
			voiceAgentContext: row?.voiceAgentContext ?? null,
		};
	}),

	/** Opt in/out of server-side ambient nudges (the kill-switch). */
	setEnabled: protectedProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return upsertSettings({
				organizationId,
				userId: ctx.session.user.id,
				values: { ambientEnabled: input.enabled },
			});
		}),

	/** Set/clear the optional server-side persona used for nudges. */
	setPersona: protectedProcedure
		.input(z.object({ persona: z.string().trim().max(1000).nullable() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return upsertSettings({
				organizationId,
				userId: ctx.session.user.id,
				values: { voiceAgentContext: input.persona || null },
			});
		}),
} satisfies TRPCRouterRecord;

/**
 * Upsert the (organization, user) settings row, returning the post-commit
 * Electric txid. Conflict target is the (organization_id, created_by) unique.
 */
async function upsertSettings(args: {
	organizationId: string;
	userId: string;
	values: { ambientEnabled?: boolean; voiceAgentContext?: string | null };
}): Promise<{ txid: number }> {
	const { organizationId, userId, values } = args;
	return dbWs.transaction(async (tx) => {
		await tx
			.insert(userAmbientSettings)
			.values({
				organizationId,
				createdBy: userId,
				...values,
			})
			.onConflictDoUpdate({
				target: [
					userAmbientSettings.organizationId,
					userAmbientSettings.createdBy,
				],
				set: { ...values, updatedAt: new Date() },
			});
		const txid = await getCurrentTxid(tx);
		return { txid };
	});
}
