/**
 * Admin-panel access resolution.
 *
 * A user is treated as an admin if ANY of the following hold:
 *   1. their email is on the `@rox.one` company domain (existing rule), OR
 *   2. their email is in the `ADMIN_EMAILS` allowlist env (comma-separated), OR
 *   3. their platform role is `admin` (`users.role` column).
 *
 * `resolveIsAdmin` is a pure function so the gating rules can be unit-tested
 * without a database or request context. The tRPC `adminProcedure`
 * (see ../../trpc.ts) is the single enforcement point that calls it.
 */

export interface ResolveIsAdminInput {
	/** The authenticated user's email. */
	email: string | null | undefined;
	/** The user's platform role (`users.role`), if known. */
	role?: string | null;
	/** The company email domain, e.g. "@rox.one". */
	companyEmailDomain: string;
	/** Raw `ADMIN_EMAILS` env value (comma-separated), if configured. */
	adminEmailsEnv?: string | null;
}

/** Parse the comma-separated `ADMIN_EMAILS` env into a normalized set. */
export function parseAdminEmails(
	adminEmailsEnv: string | null | undefined,
): Set<string> {
	if (!adminEmailsEnv) return new Set();
	return new Set(
		adminEmailsEnv
			.split(",")
			.map((entry) => entry.trim().toLowerCase())
			.filter((entry) => entry.length > 0),
	);
}

export function resolveIsAdmin({
	email,
	role,
	companyEmailDomain,
	adminEmailsEnv,
}: ResolveIsAdminInput): boolean {
	if (role === "admin") return true;

	if (!email) return false;
	const normalized = email.trim().toLowerCase();
	if (normalized.length === 0) return false;

	if (normalized.endsWith(companyEmailDomain.toLowerCase())) return true;

	return parseAdminEmails(adminEmailsEnv).has(normalized);
}
