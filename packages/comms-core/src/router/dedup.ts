/**
 * Cross-transport thread dedup-key derivation.
 *
 * A thread can carry messages from email, in-app, XMPP, etc. To merge a reply
 * that arrives on a different transport into the same conversation we compute a
 * stable, conservative key:
 *   1. If the message threads off a known root (RFC `References`/`In-Reply-To`
 *      root, XMPP thread id), key on that root — the strongest signal.
 *   2. Otherwise, key on the sorted set of participant addresses, so a DM and
 *      its email reply between the same two parties land together.
 *
 * Conservative by design (D1 risk "cross-transport thread mismatch"): we never
 * key across org tenants — the caller scopes lookups by `organizationId`.
 */

/** Normalize a single address for keying (lowercase, trimmed). */
function normalizeAddress(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Derive a dedup key from a thread root id (preferred) or, failing that, from
 * the participant address set. Returns `null` when there is no usable signal,
 * in which case the router creates a fresh thread.
 */
export function deriveDedupKey(args: {
	/** Root external id of the conversation, if the transport supplied one. */
	rootExternalId?: string | null;
	/** All participant addresses (from + to), any transport. */
	participantAddresses: string[];
}): string | null {
	const root = args.rootExternalId?.trim();
	if (root) {
		return `root:${root}`;
	}

	const normalized = [
		...new Set(args.participantAddresses.map(normalizeAddress)),
	]
		.filter((a) => a.length > 0)
		.sort();

	if (normalized.length === 0) return null;
	return `parts:${normalized.join(",")}`;
}
