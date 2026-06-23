import { validateHandle } from "@rox/shared/username";

/**
 * The `[handle]` route segment receives the URL-decoded path segment, which for
 * the public profile namespace is the literal `@<nickname>` form. This helper
 * unwraps the `@` prefix and runs the shared {@link validateHandle} rules
 * (length, charset, reserved words) so reserved/section names like `agents`,
 * `settings`, `api` can never shadow a real route via a fake handle.
 *
 * Returns the bare, normalized handle (no `@`) when valid, or `null` when the
 * segment is not an `@`-prefixed valid claimable handle — callers should
 * `notFound()` on `null`.
 */
export function resolveHandleParam(segment: string): string | null {
	if (!segment.startsWith("@")) return null;
	const bare = segment.slice(1);
	const result = validateHandle(bare);
	if (!result.ok || !result.normalized) return null;
	return result.normalized;
}
