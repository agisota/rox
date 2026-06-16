/**
 * Shared secret-store codec for integration credentials.
 *
 * Integration OAuth/bot tokens are stored in `integration_connections.accessToken`.
 * Historically that column held PLAINTEXT. This codec lets every provider write
 * encrypted tokens going forward while transparently reading the legacy plaintext
 * rows that predate encryption — so adoption is incremental and migration-free.
 *
 * Encryption reuses the proven AES-256-GCM helper in `../crypto` (keyed by
 * `SECRETS_ENCRYPTION_KEY`), the same primitive backing the project `secrets`
 * store and the `agentSource` registry.
 *
 * Wire format: encrypted values are prefixed with `enc:v1:` so `decodeSecret`
 * can distinguish them from legacy plaintext with zero ambiguity (a real token
 * never begins with that sentinel). `encodeSecret` is idempotent: re-encoding an
 * already-encoded value returns it unchanged.
 */

import { decryptSecret, encryptSecret } from "../crypto";

/** Sentinel marking a value produced by `encodeSecret`. */
export const ENCRYPTED_SECRET_PREFIX = "enc:v1:";

/** True when `value` is an encoded secret (vs. legacy plaintext). */
export function isEncodedSecret(value: string): boolean {
	return value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

/**
 * Encrypts `plaintext` for storage. Idempotent: an already-encoded value is
 * returned untouched so callers can safely encode on every write.
 */
export function encodeSecret(plaintext: string): string {
	if (isEncodedSecret(plaintext)) return plaintext;
	return `${ENCRYPTED_SECRET_PREFIX}${encryptSecret(plaintext)}`;
}

/**
 * Returns the plaintext token for a stored value. Encoded values are decrypted;
 * legacy plaintext values (no sentinel) are passed through unchanged so existing
 * rows keep working until they are re-saved.
 */
export function decodeSecret(stored: string): string {
	if (!isEncodedSecret(stored)) return stored;
	return decryptSecret(stored.slice(ENCRYPTED_SECRET_PREFIX.length));
}
