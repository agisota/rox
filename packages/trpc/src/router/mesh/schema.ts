import { z } from "zod";

/**
 * Zod inputs for the mesh tRPC router (D5 Phase 1).
 *
 * `provisionDevice` takes the PUBLIC keys the client generated (private keys
 * never leave the device). `rotatesFromPubkey` lets a device rotate its key,
 * reserving the old one under DQ4. The optional Noise/Ed25519 keys are for the
 * DEFERRED BLE mesh adapter.
 */

export const provisionMeshDeviceSchema = z.object({
	/** The PUBLIC Nostr pubkey (64-char hex or `npub1...`). */
	nostrPubkey: z.string().min(8).max(255),
	/** Optional human device label. */
	deviceLabel: z.string().min(1).max(120).optional(),
	/** Optional PUBLIC Noise X25519 static key (base64) for DEFERRED BLE mesh. */
	noiseStaticPub: z.string().min(16).max(255).optional(),
	/** Optional PUBLIC Ed25519 signing key (base64). */
	ed25519Pub: z.string().min(16).max(255).optional(),
	/** When rotating, the OLD pubkey to reserve + grace (DQ4). */
	rotatesFromPubkey: z.string().min(8).max(255).optional(),
});

export const listMeshDevicesSchema = z.object({}).optional();
