import { z } from "zod";

/**
 * Zod inputs for the MCP admin introspection router (WS-J §2.2 P1, T6).
 *
 * Read-only introspection of what an org currently exposes over the v2 MCP
 * surface — the skills bound with `surface = "mcp"`. Filters are optional;
 * everything is implicitly scoped to the caller's active org.
 */

export const listExposedSkillsSchema = z
	.object({
		// When omitted, includes disabled bindings too so an admin can audit them.
		enabledOnly: z.boolean().optional(),
	})
	.optional();
