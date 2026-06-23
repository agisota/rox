import { z } from "zod";

/**
 * Zod inputs for the xmpp tRPC router (D4 Phase 1).
 *
 * Provisioning derives the JID from the caller's `user_profiles.handle`, so the
 * mutation takes no handle input (the handle is read server-side). An optional
 * `domain` override exists only for non-default XMPP service domains in tests /
 * staging; production uses the env default.
 */

export const provisionJidSchema = z
	.object({
		/** Override the XMPP service domain (defaults to env / `xmpp.rox.one`). */
		domain: z.string().min(3).max(255).optional(),
	})
	.optional();

export const getBindingSchema = z.object({}).optional();
