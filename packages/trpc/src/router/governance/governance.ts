import { db, dbWs } from "@rox/db/client";
import { v2Workspaces, workspaceGovernanceItems } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createGovernanceItemSchema,
	deleteGovernanceItemSchema,
	updateGovernanceItemSchema,
} from "./schema";

/**
 * Workspace governance router (#517) — server backend for the v2 workspace
 * "Управление" panel (ЦЕЛИ/ЗАДАЧИ/МИССИИ), replacing the former localStorage
 * collection with org-scoped Postgres rows synced through the electric-proxy.
 *
 * Governance items are org-shared per workspace (every member of the org sees
 * the same panel), so scoping is org-only — exactly like `automations`. Each
 * mutation:
 *   - resolves the active org via `requireActiveOrgMembership`,
 *   - scopes every row touch by `organization_id` (defense in depth: a row id
 *     from another org is never reachable),
 *   - writes on `dbWs` and returns the post-commit Electric `txid` so the
 *     desktop collection can await its own write landing in the synced shape
 *     (mirrors `prefsRouter` / `memoryRouter`).
 *
 * The renderer supplies the row `id` (crypto.randomUUID) and `order`; the server
 * is the sole authority for `organization_id` (the active org) and `created_by`
 * (the signed-in user) — clients never send those.
 */

/** Resolve a v2 workspace and assert it belongs to the active org. */
async function verifyWorkspaceInOrg(
	organizationId: string,
	workspaceId: string,
): Promise<void> {
	const [workspace] = await db
		.select({ organizationId: v2Workspaces.organizationId })
		.from(v2Workspaces)
		.where(eq(v2Workspaces.id, workspaceId))
		.limit(1);

	if (!workspace || workspace.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
}

/** Assert a governance item exists in the active org (returns its id). */
async function getGovernanceItemForOrg(
	organizationId: string,
	id: string,
): Promise<void> {
	const [item] = await db
		.select({ id: workspaceGovernanceItems.id })
		.from(workspaceGovernanceItems)
		.where(
			and(
				eq(workspaceGovernanceItems.id, id),
				eq(workspaceGovernanceItems.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!item) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Governance item not found",
		});
	}
}

export const governanceRouter = {
	/** Create a goal/task/mission in the caller's active org + workspace. */
	create: protectedProcedure
		.input(createGovernanceItemSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await verifyWorkspaceInOrg(organizationId, input.workspaceId);

			return dbWs.transaction(async (tx) => {
				await tx.insert(workspaceGovernanceItems).values({
					id: input.id,
					organizationId,
					v2WorkspaceId: input.workspaceId,
					createdBy: ctx.session.user.id,
					kind: input.kind,
					text: input.text,
					order: input.order,
				});
				const txid = await getCurrentTxid(tx);
				return { txid };
			});
		}),

	/** Edit an item's text and/or order (org-scoped). */
	update: protectedProcedure
		.input(updateGovernanceItemSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getGovernanceItemForOrg(organizationId, input.id);

			const set: { text?: string; order?: number } = {};
			if (input.text !== undefined) set.text = input.text;
			if (input.order !== undefined) set.order = input.order;
			if (set.text === undefined && set.order === undefined) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Nothing to update: provide text and/or order",
				});
			}

			return dbWs.transaction(async (tx) => {
				await tx
					.update(workspaceGovernanceItems)
					.set(set)
					.where(
						and(
							eq(workspaceGovernanceItems.id, input.id),
							eq(workspaceGovernanceItems.organizationId, organizationId),
						),
					);
				const txid = await getCurrentTxid(tx);
				return { txid };
			});
		}),

	/** Delete an item (org-scoped). */
	delete: protectedProcedure
		.input(deleteGovernanceItemSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getGovernanceItemForOrg(organizationId, input.id);

			return dbWs.transaction(async (tx) => {
				await tx
					.delete(workspaceGovernanceItems)
					.where(
						and(
							eq(workspaceGovernanceItems.id, input.id),
							eq(workspaceGovernanceItems.organizationId, organizationId),
						),
					);
				const txid = await getCurrentTxid(tx);
				return { txid };
			});
		}),
} satisfies TRPCRouterRecord;
