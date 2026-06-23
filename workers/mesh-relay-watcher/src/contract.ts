/**
 * Mesh relay-watcher CONTRACT (D5) — stub only, live deploy DEFERRED.
 *
 * This standalone process (NOT part of the bun/turbo workspace) is the trusted
 * bridge between the public Nostr relay pool and the rox D1 comms hub. When the
 * deploy wave lands it will:
 *
 *   1. subscribe to the org-curated relay set (`mesh_relays`) over websockets;
 *   2. filter for NIP-17 gift-wrapped DMs (kind 1059) addressed to a rox device
 *      pubkey present in `mesh_devices`;
 *   3. unwrap the gift-wrap + decrypt with the recipient's key material (which
 *      the relay-watcher holds via the deploy-wave key-escrow design — NOT this
 *      PR), yielding the inner plaintext DM;
 *   4. POST each as a {@link RelayWatcherOutboundEvent} to `/api/mesh/inbound`,
 *      signed with `MESH_INBOUND_SECRET` (HMAC + timestamp + nonce) exactly like
 *      the D4 XMPP bridge.
 *
 * NO live relay connections and NO key signing are implemented here — those are
 * the deferred deploy-wave work. This file freezes the wire CONTRACT so the API
 * ingress (`apps/api/src/lib/mesh/parse.ts`) and a future watcher implementation
 * agree on the envelope shape.
 */

/**
 * The signed envelope the relay-watcher POSTs to `/api/mesh/inbound`. MUST match
 * the fields `parseInboundMeshEnvelope` validates server-side. The transport
 * headers (`x-rox-mesh-signature` / `-timestamp` / `-nonce`) are HTTP headers,
 * not part of this JSON body.
 */
export interface RelayWatcherOutboundEvent {
	/** Sender Nostr pubkey (hex or npub). */
	fromPubkey: string;
	/** Recipient Nostr pubkey (the rox user's device key). */
	toPubkey: string;
	/** The decrypted inner DM plaintext. */
	body: string;
	/** Nostr event id (the dedup key); omit if the relay provided none. */
	eventId?: string | null;
	/** Conversation thread tag, if the sender set one. */
	thread?: string | null;
	/** The event this replies to, if any. */
	replyToEventId?: string | null;
	/** Optional human subject. */
	subject?: string | null;
	/** Nostr event kind of the inner DM. */
	kind?: number | null;
	/** The relay url the event was observed on (telemetry). */
	relayUrl?: string | null;
	/** Event `created_at` (unix seconds) or ISO string. */
	sentAt?: number | string;
}

/** The three HMAC auth headers the watcher must stamp on every POST. */
export interface RelayWatcherAuthHeaders {
	"x-rox-mesh-signature": string;
	"x-rox-mesh-timestamp": string;
	"x-rox-mesh-nonce": string;
}
