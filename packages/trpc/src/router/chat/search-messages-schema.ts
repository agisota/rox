/**
 * Zod input for `chat.searchMessages` (Hermes-borrow F15).
 *
 * DB-free (no `@rox/db` import) so the clamp/default contract is unit-testable
 * without a live database — mirrors `recents-schema` / `labels-schema`, which the
 * chat router composes the same way.
 *
 * `sessionId` is optional: present → search ONE session's messages (the
 * in-conversation filter box), absent → search every message the caller owns in
 * the active org (a cross-session content search). The query itself is bounded so
 * a runaway term never reaches `websearch_to_tsquery`.
 */

import { z } from "zod";

/** Default page size for a message search. */
export const SEARCH_MESSAGES_DEFAULT_LIMIT = 20;
/** Hard cap so a search never over-fetches. */
export const SEARCH_MESSAGES_MAX_LIMIT = 50;

export const searchMessagesSchema = z.object({
	/** The raw user query; normalized + bound as a parameter server-side. */
	query: z.string().trim().min(1).max(200),
	/** Restrict to one session's messages; omitted = all sessions in the org. */
	sessionId: z.uuid().optional(),
	/** Per-page result cap; the total count is computed independent of it. */
	limit: z
		.number()
		.int()
		.min(1)
		.max(SEARCH_MESSAGES_MAX_LIMIT)
		.default(SEARCH_MESSAGES_DEFAULT_LIMIT),
});

export type SearchMessagesInput = z.infer<typeof searchMessagesSchema>;
