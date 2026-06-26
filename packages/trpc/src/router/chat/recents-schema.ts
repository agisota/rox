/**
 * Zod input for `chat.recents` (Hermes-borrow F49).
 *
 * Kept in its own DB-free module (no `@rox/db` import) so the limit clamp
 * contract is unit-testable without a live database — mirrors `labels-schema`,
 * which the router composes the same way.
 */

import { z } from "zod";

/** Default recents count for the scrollback rail's Recents-flyout (~10). */
export const RECENTS_DEFAULT_LIMIT = 10;
/** Hard cap so the flyout never over-fetches. */
export const RECENTS_MAX_LIMIT = 25;

/**
 * Optional `limit` for `chat.recents`. Defaults to ~10 and is clamped to 25.
 */
export const recentsInputSchema = z
	.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(RECENTS_MAX_LIMIT)
			.default(RECENTS_DEFAULT_LIMIT),
	})
	.optional();
