/**
 * Backward-compatible re-export. The implementation now lives in the shared
 * `lib/crypto.ts` so the `secrets` store and the `agentSource` registry share
 * one AES-256-GCM implementation. Import from `../../../../lib/crypto` for new
 * code.
 */

export { decryptSecret, encryptSecret } from "../../../../lib/crypto";
