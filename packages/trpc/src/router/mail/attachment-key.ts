/**
 * Server-derived R2 object keys for OUTBOUND mail attachments (FN-141 / #701).
 *
 * The presigned PUT path NEVER trusts a client-supplied key: the key is built
 * here from the immutable owner user id + a content hash, under a fixed
 * `mail/outbound/<userId>/` prefix. So a client can only ever upload into (and
 * later send from) its OWN prefix — `mail.send` re-validates the prefix before
 * persisting any attachment, closing the "send a key that points at someone
 * else's object" hole.
 *
 * Content-addressed (`<sha256>`) so re-staging the same file is idempotent and
 * dedups, mirroring Drive's `u/<userId>/<sha256>` scheme (DECISIONS.md DQ1).
 */

/** The owner-scoped prefix every outbound attachment key starts with. */
export function mailOutboundPrefix(userId: string): string {
	return `mail/outbound/${userId}/`;
}

/**
 * Content-addressed key for one outbound attachment: owner prefix + the file's
 * sha256. Stable across re-uploads of identical bytes (idempotent staging).
 */
export function mailAttachmentKey(userId: string, sha256: string): string {
	return `${mailOutboundPrefix(userId)}${sha256.toLowerCase()}`;
}

/**
 * Guard: a key is a legitimate outbound attachment for `userId` only when it
 * sits under that user's `mail/outbound/<userId>/` prefix. Used by `mail.send`
 * to reject a key the caller did not mint for itself.
 */
export function isOwnedMailAttachmentKey(userId: string, key: string): boolean {
	return key.startsWith(mailOutboundPrefix(userId));
}
