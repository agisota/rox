/**
 * Username (handle) rules for the public `@<handle>` route namespace (ROX-522).
 *
 * A handle is the slug that follows `@` in `rox.one/@<handle>/…`. Because the
 * handle owns a top-level route namespace, it must be:
 *   - 4–16 characters
 *   - lowercase `[a-z0-9_]` only
 *   - not a reserved word that collides with a section / system route
 *
 * `validateHandle` is a pure function: no DB, no I/O. Uniqueness is enforced
 * separately by the `user_profiles.handle` unique index.
 */

export const HANDLE_MIN_LENGTH = 4;
export const HANDLE_MAX_LENGTH = 16;

/** Allowed handle characters (already-lowercased input). */
export const HANDLE_PATTERN = /^[a-z0-9_]+$/;

/**
 * Words that may not be claimed as a handle because they collide with the
 * `@<handle>` route namespace or with top-level system routes. Sorted by
 * concern; kept as a flat `Set` for O(1) lookup. Append-only — removing an
 * entry could expose a route to handle squatting.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
	// `@<handle>` section paths (see share-link.ts).
	"agents",
	"subagents",
	"hooks",
	"drive",
	"feed",
	"projects",
	"stats",
	"skills",
	"shared",
	"sessions",
	"artifacts",
	// Top-level / system routes.
	"admin",
	"api",
	"app",
	"auth",
	"settings",
	"login",
	"logout",
	"signin",
	"signup",
	"register",
	"onboarding",
	"dashboard",
	"home",
	"help",
	"support",
	"about",
	"pricing",
	"billing",
	"docs",
	"blog",
	"status",
	"legal",
	"privacy",
	"terms",
	"security",
	"www",
	"mail",
	"ftp",
	"cdn",
	"static",
	"assets",
	"public",
	"root",
	"system",
	"null",
	"undefined",
	// Brand reservations.
	"rox",
	"rox_one",
	"roxone",
	"team",
	"teams",
	"org",
	"orgs",
	"user",
	"users",
	"me",
]);

/**
 * OAuth providers a user must have linked (better-auth `auth.accounts.provider_id`)
 * before they're allowed to claim a custom `handle` (ROX-522 gating rule).
 *
 * The product intent is GitHub + Twitter(X) + Telegram, but X is DEFERRED (paid),
 * so the live gate is the currently-reachable set. Add `"x"` here once the X
 * provider ships — never hardcode an unreachable gate. Values match
 * `auth.accounts.provider_id` (see telegram-plugin `TELEGRAM_PROVIDER_ID` and the
 * `github` social provider), NOT the `registration_provider` enum.
 */
export const REQUIRED_HANDLE_PROVIDERS = ["github", "telegram"] as const;

export type RequiredHandleProvider = (typeof REQUIRED_HANDLE_PROVIDERS)[number];

/**
 * Given the provider ids a user has linked, return the subset of
 * {@link REQUIRED_HANDLE_PROVIDERS} they're still missing. Empty array means the
 * handle-claim gate is satisfied. Pure — gating is enforced server-side; this is
 * shared so the client can render the same locked state without guessing.
 */
export function missingHandleProviders(
	linkedProviderIds: readonly string[],
): RequiredHandleProvider[] {
	const linked = new Set(linkedProviderIds);
	return REQUIRED_HANDLE_PROVIDERS.filter((provider) => !linked.has(provider));
}

/** True when the linked providers satisfy the handle-claim gate. */
export function canClaimHandle(linkedProviderIds: readonly string[]): boolean {
	return missingHandleProviders(linkedProviderIds).length === 0;
}

export type HandleErrorCode =
	| "empty"
	| "too_short"
	| "too_long"
	| "invalid_chars"
	| "reserved";

export interface ValidateHandleResult {
	ok: boolean;
	/** Present only when `ok` is false. */
	error?: HandleErrorCode;
	/** The lowercased, trimmed handle. Present whenever input is non-empty. */
	normalized?: string;
}

/**
 * Validate (and normalize) a candidate handle.
 *
 * Input is trimmed and lowercased before checks, so callers may pass
 * mixed-case input. The normalized value is returned for storage. This is a
 * pure check; it does NOT verify uniqueness.
 */
export function validateHandle(input: string): ValidateHandleResult {
	const normalized = input.trim().toLowerCase();

	if (normalized.length === 0) {
		return { ok: false, error: "empty" };
	}
	if (normalized.length < HANDLE_MIN_LENGTH) {
		return { ok: false, error: "too_short", normalized };
	}
	if (normalized.length > HANDLE_MAX_LENGTH) {
		return { ok: false, error: "too_long", normalized };
	}
	if (!HANDLE_PATTERN.test(normalized)) {
		return { ok: false, error: "invalid_chars", normalized };
	}
	if (RESERVED_HANDLES.has(normalized)) {
		return { ok: false, error: "reserved", normalized };
	}

	return { ok: true, normalized };
}

/** True when `input` is a valid, claimable handle. */
export function isValidHandle(input: string): boolean {
	return validateHandle(input).ok;
}
