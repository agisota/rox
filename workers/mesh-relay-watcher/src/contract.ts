/**
 * Mesh relay-watcher CONTRACT (D5) — the wire envelope shared with the API.
 *
 * This standalone process (NOT part of the bun/turbo workspace) is the trusted
 * SERVER-ESCROW bridge between the public Nostr relay pool and the rox D1 comms
 * hub. The runnable implementation lives in `./index.ts` + `./unwrap.ts` +
 * `./post.ts`; it:
 *
 *   1. subscribes the org-curated relay set (`mesh_relays`) over websockets;
 *   2. filters NIP-17 gift-wrapped DMs (kind 1059) addressed to the SERVER-HELD
 *      escrow pubkey (`mesh_escrow_keys`);
 *   3. unwraps the gift-wrap + decrypts with the escrow PRIVATE key — held by the
 *      watcher (loaded from Infisical/env), because mesh is a transport-fallback
 *      bridge, NOT an E2E-private product — yielding the inner plaintext DM;
 *   4. POSTs each as a {@link RelayWatcherOutboundEvent} to `/api/mesh/inbound`,
 *      signed with `MESH_INBOUND_SECRET` (HMAC + timestamp + nonce) exactly like
 *      the D4 XMPP bridge.
 *
 * This file freezes the wire CONTRACT so the API ingress
 * (`apps/api/src/lib/mesh/parse.ts`) and the watcher implementation agree on the
 * envelope shape. A LIVE end-to-end receive still needs this process DEPLOYED +
 * an escrow key PROVISIONED on an always-on host (deploy follow-up, outside CI).
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
