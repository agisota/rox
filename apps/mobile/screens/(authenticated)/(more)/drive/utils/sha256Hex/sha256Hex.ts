import * as Crypto from "expo-crypto";
import { bytesToHex } from "./bytesToHex";

/**
 * SHA-256 the given bytes and return the lowercase hex digest used as the Drive
 * content address. Thin wrapper over `expo-crypto` so the screen/hook never
 * touches the native module directly. The pure hex encoding lives in
 * {@link bytesToHex} so it stays unit-testable without native modules.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await Crypto.digest(
		Crypto.CryptoDigestAlgorithm.SHA256,
		bytes,
	);
	return bytesToHex(new Uint8Array(digest));
}
