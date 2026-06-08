import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

/**
 * Decrypts a Lark encrypted event.
 *
 * Lark AES-256-CBC format:
 *   key     = SHA256(encryptKey)
 *   payload = Base64(iv[16] + AES-256-CBC(key, iv, PKCS7-padded message))
 */
export function decryptLarkEvent(
	encryptKey: string,
	encrypted: string,
): string {
	const key = createHash("sha256").update(encryptKey).digest();
	const data = Buffer.from(encrypted, "base64");
	const iv = data.subarray(0, 16);
	const ciphertext = data.subarray(16);
	const decipher = createDecipheriv("aes-256-cbc", key, iv);
	const decrypted = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
}

/**
 * Verifies the Lark webhook request signature (non-encrypted events).
 * Signature = SHA256(timestamp + nonce + encryptKey + body), compared to
 * the X-Lark-Signature header.
 */
export function verifyLarkSignature({
	timestamp,
	nonce,
	encryptKey,
	body,
	signature,
}: {
	timestamp: string;
	nonce: string;
	encryptKey: string;
	body: string;
	signature: string;
}): boolean {
	try {
		const computed = createHash("sha256")
			.update(timestamp + nonce + encryptKey + body)
			.digest("hex");
		const a = Buffer.from(computed, "hex");
		const b = Buffer.from(signature, "hex");
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
