/**
 * Share-password hashing for `drive_shares.password_hash` (D8 §2.5).
 *
 * Uses Node's built-in `scrypt` KDF (no new dependency — the repo has neither
 * argon2 nor bcrypt). Format: `scrypt$<saltHex>$<hashHex>`, self-describing so
 * verification needs no out-of-band params. Verify is constant-time.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
const SALT_BYTES = 16;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, KEYLEN, (err, derived) => {
			if (err) reject(err);
			else resolve(derived);
		});
	});
}

/** Hash a share password into a self-describing `scrypt$salt$hash` string. */
export async function hashSharePassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const derived = await scryptAsync(password, salt);
	return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Constant-time verify a candidate password against a stored hash. */
export async function verifySharePassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 3 || parts[0] !== "scrypt") return false;
	const salt = Buffer.from(parts[1] ?? "", "hex");
	const expected = Buffer.from(parts[2] ?? "", "hex");
	if (salt.length === 0 || expected.length === 0) return false;
	const derived = await scryptAsync(password, salt);
	if (derived.length !== expected.length) return false;
	return timingSafeEqual(derived, expected);
}
