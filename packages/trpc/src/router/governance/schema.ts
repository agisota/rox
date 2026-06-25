import { governanceKindValues } from "@rox/db/schema";
import { z } from "zod";

/**
 * Zod inputs for the workspace governance router (#517).
 *
 * The "Управление" panel CRUD wire contract. The renderer generates the row
 * `id` (crypto.randomUUID) and supplies `order`, so the create input carries
 * both; the server fills `organization_id` + `created_by` authoritatively (the
 * client never sends them). `kind` is constrained to the same three values as
 * the DB `governance_kind` enum (sourced from `@rox/db/schema` so db/trpc/client
 * cannot drift). Mutations return the post-commit Electric txid so the desktop
 * collection can await its own write landing in the synced shape.
 */

/** Item body: non-empty, capped to keep a single row sane. */
const governanceTextSchema = z.string().trim().min(1).max(10_000);
/** Sort order within (workspaceId, kind); lower renders first. */
const governanceOrderSchema = z.number().int().min(0);
export const governanceKindSchema = z.enum(governanceKindValues);

export const createGovernanceItemSchema = z.object({
	id: z.string().uuid(),
	workspaceId: z.string().uuid(),
	kind: governanceKindSchema,
	text: governanceTextSchema,
	order: governanceOrderSchema,
});
export type CreateGovernanceItemInput = z.infer<
	typeof createGovernanceItemSchema
>;

export const updateGovernanceItemSchema = z.object({
	id: z.string().uuid(),
	text: governanceTextSchema.optional(),
	order: governanceOrderSchema.optional(),
});
export type UpdateGovernanceItemInput = z.infer<
	typeof updateGovernanceItemSchema
>;

export const deleteGovernanceItemSchema = z.object({
	id: z.string().uuid(),
});
export type DeleteGovernanceItemInput = z.infer<
	typeof deleteGovernanceItemSchema
>;
