/**
 * `provisionMeshDevice` — the D5 mesh device-key binding service (Phase 1).
 *
 * Binds a rox user to a per-device PUBLIC mesh identity (a Nostr pubkey + optional
 * Noise/Ed25519 public keys) in `mesh_devices`. A user may have MANY devices
 * (phone, laptop, …), each its own key, so this is 1:N — unlike the 1:1 JID
 * binding. It honors the owner's handle-recycling decision applied to keys
 * (DECISIONS.md DQ4):
 *
 *   - First provision of a pubkey for a user → insert a `mesh_devices` row
 *     (status `active`).
 *   - Re-provision with the SAME pubkey by the SAME user → no-op (idempotent;
 *     safe to call on every sign-in / device-attest).
 *   - Rotation (`oldPubkey → newPubkey` for the same device) → the OLD pubkey is
 *     reserved: its row flips to status `reserved` with a 90-day `reserved_until`
 *     grace window (the old key keeps routing to the owner during it), and a new
 *     `active` row is inserted for the new pubkey. The old pubkey is reserved
 *     PERMANENTLY (never reassigned to anyone else) — the reserved row IS the
 *     permanent reservation; `reserved_until` only bounds active *routing*.
 *
 * CRITICAL: only PUBLIC keys are ever passed in or stored. The private key lives
 * client-side (expo-secure-store / Electron safeStorage) and never reaches here.
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ3 — identity is GLOBAL per user; the mesh key belongs to the person. The
 *         `organization_id` stamped on the row is the Electric shape filter, never
 *         a silo boundary.
 *   DQ4 — a rotated pubkey is reserved permanently; old key aliases to the owner
 *         for 90 days then retires.
 *
 * The db surface is INJECTED (`ProvisionMeshDeviceDb`) so this orchestration
 * unit-tests against an in-memory fake with no live database; the tRPC router
 * passes a thin Drizzle-backed adapter (see `./drizzleDb`).
 */

import { normalizeBase64Key, normalizeNostrPubkey } from "@rox/comms-core";

/** The 90-day grace window (DQ4) for a rotated device key's old pubkey, in ms. */
export const MESH_KEY_GRACE_MS = 90 * 24 * 60 * 60 * 1000;

/** A bound mesh device row (the subset the service reads/writes). */
export interface MeshDeviceRow {
	id: string;
	userId: string;
	organizationId: string;
	nostrPubkey: string;
	status: "active" | "revoked" | "reserved";
}

/**
 * The narrow db surface `provisionMeshDevice` needs. Structurally satisfied by
 * both the real Drizzle adapter and the test fake.
 */
export interface ProvisionMeshDeviceDb {
	/** The active device row for (user, pubkey), or null if none. */
	findDeviceByUserAndPubkey(args: {
		userId: string;
		nostrPubkey: string;
	}): Promise<MeshDeviceRow | null>;

	/**
	 * Who currently owns this pubkey (active OR reserved), or null if free. Used
	 * to reject claiming a pubkey reserved/owned by another user (DQ4 permanent
	 * reservation + global uniqueness).
	 */
	findOwnerOfPubkey(nostrPubkey: string): Promise<{ userId: string } | null>;

	/** The active device row carrying `rotatesFromPubkey`, or null. */
	findDeviceByPubkey(nostrPubkey: string): Promise<MeshDeviceRow | null>;

	/** Insert a fresh active device row, returning it. */
	insertDevice(row: {
		userId: string;
		organizationId: string;
		deviceLabel: string | null;
		nostrPubkey: string;
		noiseStaticPub: string | null;
		ed25519Pub: string | null;
	}): Promise<MeshDeviceRow>;

	/** Reserve a rotated-out device (status → reserved, set reserved_until). */
	reserveDevice(args: { deviceId: string; reservedUntil: Date }): Promise<void>;
}

export interface ProvisionMeshDeviceInput {
	/** `auth.users.id` — the stable owner key (survives key rotations). */
	userId: string;
	/** Org to stamp on the row (the user's personal/active org). DQ3: not a silo. */
	organizationId: string;
	/** The PUBLIC Nostr pubkey (hex or npub) to bind. */
	nostrPubkey: string;
	/** Optional human device label ("Mark's iPhone"). */
	deviceLabel?: string | null;
	/** Optional PUBLIC Noise X25519 static key (base64) for the DEFERRED BLE mesh. */
	noiseStaticPub?: string | null;
	/** Optional PUBLIC Ed25519 signing key (base64). */
	ed25519Pub?: string | null;
	/**
	 * When rotating a device's key, the OLD pubkey to reserve+grace. The old row
	 * must belong to the SAME user; otherwise it is ignored (a fresh bind).
	 */
	rotatesFromPubkey?: string | null;
}

export type ProvisionMeshDeviceOutcome = "created" | "rotated" | "unchanged";

export interface ProvisionMeshDeviceResult {
	deviceId: string;
	nostrPubkey: string;
	outcome: ProvisionMeshDeviceOutcome;
	/** The previous pubkey reserved by a rotation, if any. */
	previousPubkey?: string;
}

/**
 * Provision (or re-affirm / rotate) a user's mesh device key. Safe to call on
 * every device sign-in: a same-pubkey call is a no-op.
 *
 * @throws if the pubkey is reserved/owned by a DIFFERENT user (DQ4 + uniqueness).
 */
export async function provisionMeshDevice(
	db: ProvisionMeshDeviceDb,
	input: ProvisionMeshDeviceInput,
	now: () => Date = () => new Date(),
): Promise<ProvisionMeshDeviceResult> {
	const nostrPubkey = normalizeNostrPubkey(input.nostrPubkey);
	const noiseStaticPub = normalizeBase64Key(input.noiseStaticPub);
	const ed25519Pub = normalizeBase64Key(input.ed25519Pub);

	// Unchanged: this user already owns an active row for this exact pubkey.
	const existing = await db.findDeviceByUserAndPubkey({
		userId: input.userId,
		nostrPubkey,
	});
	if (existing && existing.status === "active") {
		return {
			deviceId: existing.id,
			nostrPubkey,
			outcome: "unchanged",
		};
	}

	// DQ4 + global uniqueness: the pubkey must not be owned/reserved by ANOTHER
	// user. (A reserved row for THIS user — e.g. a re-rotation back — is allowed.)
	const owner = await db.findOwnerOfPubkey(nostrPubkey);
	if (owner && owner.userId !== input.userId) {
		throw new Error(`Mesh pubkey "${nostrPubkey}" is reserved to another user`);
	}

	// Rotation: reserve the old device row (90-day grace) before binding the new
	// pubkey. Only honor a rotation whose old key belongs to THIS user.
	let previousPubkey: string | undefined;
	if (input.rotatesFromPubkey) {
		const oldPubkey = normalizeNostrPubkey(input.rotatesFromPubkey);
		const old = await db.findDeviceByPubkey(oldPubkey);
		if (old && old.userId === input.userId && old.status === "active") {
			await db.reserveDevice({
				deviceId: old.id,
				reservedUntil: new Date(now().getTime() + MESH_KEY_GRACE_MS),
			});
			previousPubkey = oldPubkey;
		}
	}

	const inserted = await db.insertDevice({
		userId: input.userId,
		organizationId: input.organizationId,
		deviceLabel: input.deviceLabel ?? null,
		nostrPubkey,
		noiseStaticPub,
		ed25519Pub,
	});

	return {
		deviceId: inserted.id,
		nostrPubkey,
		outcome: previousPubkey ? "rotated" : "created",
		...(previousPubkey ? { previousPubkey } : {}),
	};
}
