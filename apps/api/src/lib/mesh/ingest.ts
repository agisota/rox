/**
 * Inbound mesh relay-watcher ingest (D5 Phase 3).
 *
 * The signed event the trusted relay-watcher POSTs to `/api/mesh/inbound` (a
 * Nostr event already destructured + gift-wrap already unwrapped) is turned into
 * durable rows here:
 *
 *   1. parse the event into the hub-neutral {@link NormalizedMessage} shape via
 *      the pure `@rox/comms-core` {@link MeshAdapter} (transport = mesh);
 *   2. resolve the recipient device pubkey → the owning rox user via
 *      `mesh_devices` (status `active`) OR a still-reserved key inside its grace
 *      window (DQ4);
 *   3. verify the SENDER pubkey maps to a known device too — inbound is only
 *      accepted from peers whose pubkey is a known `mesh_devices` row (anti-spam,
 *      D5 §5 abuse mitigation). An unknown sender is rejected as `no_such_pubkey`;
 *   4. dedup on `(mesh, event_id)` — a relay redelivery is a no-op. When the
 *      event carries no id we derive a deterministic id from stable fields so
 *      id-less redeliveries are still idempotent;
 *   5. emit a unified-inbox envelope into D1 (`comms_threads` + `comms_messages`,
 *      transport = mesh), find-or-create the thread keyed by the event thread /
 *      reply id;
 *   6. write a `mesh_delivery_log` ledger row (direction inbound) — the audit +
 *      dedup contract against relay redelivery, idempotent on
 *      `(org, idempotency_key, direction)`.
 *
 * The db handle is INJECTED (`MeshIngestDb`) so this orchestration unit-tests
 * against an in-memory fake with no live database; the route passes the real
 * Drizzle adapter (see `./drizzleDb`).
 */

import { createHash } from "node:crypto";
import {
	MeshAdapter,
	type MeshRawInbound,
	normalizeNostrPubkey,
} from "@rox/comms-core";

/** Outcome the route maps onto an HTTP status. */
export type MeshIngestResult =
	| { kind: "accepted"; messageId: string; threadId: string }
	| { kind: "duplicate"; eventId: string }
	| { kind: "no_such_pubkey" };

/** A resolved device binding (active device OR a still-reserved-in-grace one). */
export interface ResolvedDevice {
	deviceId: string;
	userId: string;
	organizationId: string;
}

/**
 * The narrow db surface ingest needs. Structurally satisfied by both the real
 * Drizzle adapter and the test fake.
 */
export interface MeshIngestDb {
	/**
	 * Resolve a device pubkey → the owning device, or null if unknown. An active
	 * device always resolves; a `reserved` device resolves only inside its grace
	 * window (DQ4). Used for BOTH the recipient and the sender check.
	 */
	resolveDeviceByPubkey(args: {
		nostrPubkey: string;
		now: Date;
	}): Promise<ResolvedDevice | null>;

	/** Has this (mesh, eventId) already been ingested? (idempotency gate) */
	findMessageByEventId(eventId: string): Promise<{ id: string } | null>;

	/**
	 * Emit the unified-inbox (D1) envelope. Returns the comms message + thread ids
	 * so the delivery ledger can correlate.
	 */
	emitToUnifiedInbox(args: {
		organizationId: string;
		toUserId: string;
		fromPubkey: string;
		toPubkey: string;
		body: string;
		subject: string | null;
		eventId: string | null;
		replyToEventId: string | null;
		thread: string | null;
		relayUrl: string | null;
		createdAt: Date;
	}): Promise<{ messageId: string; threadId: string }>;

	/** Write the delivery ledger row (idempotent on org+idempotencyKey+direction). */
	recordDelivery(args: {
		organizationId: string;
		messageId: string;
		idempotencyKey: string;
		fromPubkey: string;
		toPubkey: string;
		relayUrl: string | null;
		eventId: string | null;
	}): Promise<void>;
}

export interface MeshIngestOptions {
	/** Clock injection for the grace-window check (tests). */
	now?: () => Date;
}

// A pure adapter instance for inbound normalization only — `send` is never
// called here (the relay-watcher owns outbound), so throwing stubs document that.
const inboundAdapter = new MeshAdapter({
	sign: () => {
		throw new Error("MeshAdapter.sign is not used on the inbound ingest path");
	},
	publish: () => {
		throw new Error(
			"MeshAdapter.publish is not used on the inbound ingest path",
		);
	},
});

/** Prefix marking a dedup id we derived ourselves (no Nostr event id). */
const DERIVED_DEDUP_PREFIX = "mesh-derived:";

/**
 * Derive a DETERMINISTIC dedup id for an event that arrived without a Nostr
 * event id. The id is a stable hash of fields that survive a relay redelivery of
 * the SAME event but differ across DISTINCT events: sender/recipient pubkeys, the
 * conversation thread, the event timestamp, and the body. The `createdAt`
 * timestamp is the event's `created_at` (preserved across redelivery), so two
 * genuinely different messages — even with identical text — get different ids
 * while a redelivery collapses.
 */
function deriveDedupId(args: {
	from: string;
	to: string;
	thread: string | null;
	createdAt: Date;
	body: string;
}): string {
	const fingerprint = [
		args.from,
		args.to,
		args.thread ?? "",
		args.createdAt.getTime(),
		args.body,
	].join(" ");
	const digest = createHash("sha256").update(fingerprint).digest("hex");
	return `${DERIVED_DEDUP_PREFIX}${digest}`;
}

function safeNormalize(pubkey: string): string {
	try {
		return normalizeNostrPubkey(pubkey);
	} catch {
		return pubkey.trim().toLowerCase();
	}
}

/**
 * Ingest one inbound mesh relay-watcher event. Idempotent on `(mesh, eventId)`: a
 * redelivered POST returns `duplicate` without re-inserting.
 */
export async function ingestInboundMesh(
	db: MeshIngestDb,
	raw: MeshRawInbound,
	opts: MeshIngestOptions = {},
): Promise<MeshIngestResult> {
	const now = opts.now ?? (() => new Date());

	// 1. Normalize via the pure adapter (transport = mesh, pubkeys normalized).
	const msg = inboundAdapter.normalizeInbound(raw);
	const toPubkey = msg.to[0];
	if (!toPubkey) return { kind: "no_such_pubkey" };

	// 2. Resolve the recipient device pubkey → owning rox user (active or grace).
	const recipient = await db.resolveDeviceByPubkey({
		nostrPubkey: safeNormalize(toPubkey),
		now: now(),
	});
	if (!recipient) return { kind: "no_such_pubkey" };

	// 3. Anti-spam: the SENDER pubkey must also be a known mesh device (a real rox
	//    user / contact). Reject events from strangers (D5 §5 abuse mitigation).
	const sender = await db.resolveDeviceByPubkey({
		nostrPubkey: safeNormalize(msg.from),
		now: now(),
	});
	if (!sender) return { kind: "no_such_pubkey" };

	const thread =
		typeof msg.metadata.thread === "string" ? msg.metadata.thread : null;
	const relayUrl =
		typeof msg.metadata.relayUrl === "string" ? msg.metadata.relayUrl : null;

	// The dedup key: the real Nostr event id when present, otherwise a
	// deterministic hash of stable event fields so a redelivery of the SAME id-less
	// event is still idempotent.
	const dedupId =
		msg.externalId ??
		deriveDedupId({
			from: msg.from,
			to: toPubkey,
			thread,
			createdAt: msg.createdAt,
			body: msg.body,
		});

	// 4. Idempotency gate on (mesh, dedupId) — real event id or derived hash.
	const existing = await db.findMessageByEventId(dedupId);
	if (existing) return { kind: "duplicate", eventId: dedupId };

	// 5. Emit the unified-inbox (D1) envelope. `eventId` carries the dedup id so
	//    the (mesh, externalId) gate above engages on the next redelivery.
	const emitted = await db.emitToUnifiedInbox({
		organizationId: recipient.organizationId,
		toUserId: recipient.userId,
		fromPubkey: msg.from,
		toPubkey,
		body: msg.body,
		subject: msg.subject,
		eventId: dedupId,
		replyToEventId: msg.inReplyToExternalId,
		thread,
		relayUrl,
		createdAt: msg.createdAt,
	});

	// 6. Ledger the delivery fact. `idempotencyKey` is the same dedup id so the
	//    unique (org, idempotency_key, direction) index collapses redeliveries.
	await db.recordDelivery({
		organizationId: recipient.organizationId,
		messageId: emitted.messageId,
		idempotencyKey: dedupId,
		fromPubkey: msg.from,
		toPubkey,
		relayUrl,
		eventId: msg.externalId,
	});

	return {
		kind: "accepted",
		messageId: emitted.messageId,
		threadId: emitted.threadId,
	};
}
