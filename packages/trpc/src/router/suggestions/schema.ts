import { z } from "zod";
import { EMPTY_STATE_SURFACES } from "./suggest";

/**
 * Zod input for the suggestions endpoint (F57, Hermes-borrow #650).
 *
 * The client passes the surface plus the persona/workspace context it already
 * resolved on-device (F21/F25), so the server seeds context-aware starters
 * without a new query/migration. Names are trimmed + length-capped to keep the
 * generated copy bounded.
 */
const nameSchema = z.string().trim().min(1).max(80).optional();

export const forSurfaceSchema = z.object({
	surface: z.enum(EMPTY_STATE_SURFACES),
	personaName: nameSchema,
	workspaceName: nameSchema,
});
export type ForSurfaceInput = z.infer<typeof forSurfaceSchema>;
