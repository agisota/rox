/**
 * Pure handle -> JID derivation + JID parsing (D4 "identity contract").
 *
 * The rox handle (`user_profiles.handle`, ROX-522) is the JID localpart; the
 * domain is the XMPP service domain (env-overridable, default `xmpp.rox.one`).
 * Localparts are case-folded and validated against the RFC 7622 forbidden set
 * so a handle can never produce an unroutable or ambiguous JID. A small set of
 * reserved localparts (the bridge/admin/system accounts) is rejected so a user
 * handle can't shadow infrastructure JIDs.
 *
 * Pure + dependency-light so the XMPP adapter, the provisioning service, and the
 * bridge ingress all share one derivation and unit-test without a database.
 */

/** The canonical XMPP service domain for derived rox JIDs. */
export const ROX_XMPP_DOMAIN = "xmpp.rox.one";

/**
 * Localparts a user handle may never claim - they back infrastructure JIDs
 * (the XEP-0114 component, admin, system notices). Lowercase.
 */
export const RESERVED_JID_LOCALPARTS: ReadonlySet<string> = new Set([
	"admin",
	"bridge",
	"component",
	"system",
	"postmaster",
	"abuse",
	"xmpp",
	"server",
	"root",
]);

/**
 * RFC 7622 forbids these code points in a JID localpart (`"&'/:<>@` plus any
 * whitespace). A hyphen, dot, and underscore are legal, so dotted/hyphenated rox
 * handles map straight through.
 */
const FORBIDDEN_LOCALPART = /["&'/:<>@\s]/;

/** A parsed bare/full JID. */
export interface ParsedJid {
	/** Localpart before `@` (folded lowercase), or null for a domain-only JID. */
	localpart: string | null;
	domain: string;
	/** Resource after `/`, or null for a bare JID. */
	resource: string | null;
	/** The bare JID `localpart@domain` (no resource), lowercased. */
	bare: string;
}

/**
 * Normalize a rox handle into a JID localpart.
 *
 * Lowercased + trimmed (the JID space is case-insensitive so `Alice` and
 * `alice` are the same account). Throws on an empty handle, a handle containing
 * forbidden characters, or a reserved infrastructure localpart.
 */
export function normalizeJidLocalpart(handle: string): string {
	const localpart = handle.trim().toLowerCase();
	if (localpart.length === 0) {
		throw new Error("Cannot derive a JID from an empty handle");
	}
	if (localpart.length > 1023) {
		throw new Error("JID localpart exceeds the RFC 7622 limit (1023 bytes)");
	}
	if (FORBIDDEN_LOCALPART.test(localpart)) {
		throw new Error(`Handle "${handle}" contains characters illegal in a JID`);
	}
	if (RESERVED_JID_LOCALPARTS.has(localpart)) {
		throw new Error(
			`Localpart "${localpart}" is reserved and cannot be claimed`,
		);
	}
	return localpart;
}

/**
 * Derive the bare JID bound to a rox handle: `<handle>@<domain>`.
 *
 * @param handle the rox `user_profiles.handle` (ROX-522), the single key.
 * @param domain override the XMPP service domain (defaults to `xmpp.rox.one`).
 */
export function deriveJid(
	handle: string,
	domain: string = ROX_XMPP_DOMAIN,
): string {
	return `${normalizeJidLocalpart(handle)}@${domain.trim().toLowerCase()}`;
}

/**
 * Parse a bare or full JID into its parts. Returns null for a malformed JID
 * (empty domain, multiple `@`, empty localpart). The localpart + domain are
 * lowercased; the resource is preserved verbatim (resources are case-sensitive).
 */
export function parseJid(jid: string): ParsedJid | null {
	const trimmed = jid.trim();
	if (trimmed.length === 0) return null;

	// Split the resource off first (everything after the first `/`).
	const slash = trimmed.indexOf("/");
	const resource = slash === -1 ? null : trimmed.slice(slash + 1);
	const withoutResource = slash === -1 ? trimmed : trimmed.slice(0, slash);

	const at = withoutResource.indexOf("@");
	// A second `@` in the bare part is malformed.
	if (withoutResource.indexOf("@", at + 1) !== -1) return null;

	let localpart: string | null;
	let domain: string;
	if (at === -1) {
		localpart = null;
		domain = withoutResource.toLowerCase();
	} else {
		localpart = withoutResource.slice(0, at).toLowerCase();
		domain = withoutResource.slice(at + 1).toLowerCase();
		if (localpart.length === 0) return null;
	}
	if (domain.length === 0) return null;

	const bare = localpart ? `${localpart}@${domain}` : domain;
	return { localpart, domain, resource: resource || null, bare };
}

/** The bare JID (`localpart@domain`, no resource), lowercased; null if invalid. */
export function bareJid(jid: string): string | null {
	return parseJid(jid)?.bare ?? null;
}
