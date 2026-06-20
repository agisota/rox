/**
 * Convert a raw byte buffer into a lowercase hex string. Pure + testable; kept
 * in its own module (no native imports) so the encoding is verifiable under Bun
 * without pulling in `expo-crypto`/`react-native`. The Drive router requires the
 * content address as a 64-char lowercase hex SHA-256 digest.
 */
export function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, "0");
	}
	return out;
}
