/**
 * `MeshAdapter` — the D5 mesh {@link TransportAdapter} (Nostr fallback transport).
 *
 * Pure translation, like every other adapter: it never persists `comms_*` /
 * `mesh_*` rows, never opens a relay connection, and — critically — never signs
 * with a real key inline. The two transport side-effects it needs are INJECTED
 * as plain functions:
 *
 *   - `sign`    — turn an unsigned event into a signed, publishable payload. For
 *                 OUTBOUND DMs the real implementation (NIP-17 gift-wrap +
 *                 secp256k1 Schnorr) is a client/worker concern using the user's
 *                 device key; the adapter only shapes the event and hands it off.
 *                 (INBOUND is different: mesh is a transport-fallback bridge, so
 *                 the relay-watcher holds a SERVER-HELD escrow key to decrypt
 *                 inbound gift-wraps — see workers/mesh-relay-watcher. This adapter
 *                 still never does inline crypto.)
 *   - `publish` — emit the signed event onto the relay pool, returning the event
 *                 id the relays accepted (the provider/dedup id).
 *
 * So the adapter unit-tests with fakes and stays inert without a live Nostr relay
 * or any private key — exactly mirroring how {@link XmppAdapter} injects its
 * bridge send fn.
 *
 *  - `normalizeInbound` parses the compact JSON event the relay-watcher / bridge
 *    POSTs to `/api/mesh/inbound` (a Nostr event already destructured + the
 *    gift-wrap already unwrapped by the trusted bridge) into the hub-neutral
 *    {@link NormalizedMessage} shape so the {@link MessageRouter} threads + dedups
 *    it uniformly (transport = `mesh`). The dedup `externalId` is the Nostr event
 *    id.
 *  - `send` builds the unsigned event, signs it via the injected `sign` fn, and
 *    publishes it via `publish`. It returns the provider id (the published event
 *    id, falling back to a locally minted id).
 *
 * Bodies of mesh conversations are owned by the D1 hub (`comms_messages`); the
 * `mesh_delivery_log` is only a transport-fact ledger (handled in the API layer,
 * not here).
 */

import { normalizeNostrPubkey } from "../identity/mesh";
import type { NormalizedMessage, OutboundDraft } from "../types";
import type {
	SendContext,
	SendResult,
	TransportAdapter,
} from "./TransportAdapter";

// ---------------------------------------------------------------------------
// Inbound event (relay-watcher / bridge → /api/mesh/inbound body)
// ---------------------------------------------------------------------------

/**
 * The compact JSON event the trusted relay-watcher signs + POSTs. A Nostr event
 * already destructured (and gift-wrap already unwrapped by the bridge) into
 * fields; the bridge owns the relay protocol, the hub owns the meaning.
 */
export interface MeshRawInbound {
	/** Sender Nostr pubkey (hex or npub), normalized by the adapter. */
	fromPubkey: string;
	/** Recipient Nostr pubkey (the rox user's device key). */
	toPubkey: string;
	/** Decrypted plaintext message body. */
	body: string;
	/** Nostr event id — the dedup key. Absent for some non-standard relays. */
	eventId?: string | null;
	/** A conversation/thread tag (Nostr `e`/`subject` tag), if the sender set one. */
	thread?: string | null;
	/** The event this is a reply to (Nostr `e` reply tag), if any. */
	replyToEventId?: string | null;
	/** Optional human subject (Nostr `subject` tag), carried when present. */
	subject?: string | null;
	/** Nostr event kind (1 = note, 14 = NIP-17 DM, …), carried for metadata. */
	kind?: number | null;
	/** The relay url the event was observed on (telemetry). */
	relayUrl?: string | null;
	/** Event `created_at` (unix seconds) or ISO/ms; defaults to now. */
	sentAt?: number | string;
}

// ---------------------------------------------------------------------------
// Outbound payloads (adapter → injected sign/publish fns)
// ---------------------------------------------------------------------------

/** The unsigned event the adapter builds before handing it to the signer. */
export interface MeshUnsignedEvent {
	/** Author Nostr pubkey — the rox user's device key. */
	fromPubkey: string;
	/** Recipient Nostr pubkey. */
	toPubkey: string;
	/** Nostr event kind (defaults to 14, NIP-17 sealed DM). */
	kind: number;
	/** Plaintext body the signer encrypts/gift-wraps. */
	body: string;
	/** Conversation/thread tag, carried for cross-side threading. */
	thread?: string;
	/** The event id this replies to, if threading off an inbound. */
	replyToEventId?: string;
	/** Event `created_at` in unix seconds. */
	createdAt: number;
}

/** A signed, publishable event (opaque to the adapter — the signer owns shape). */
export interface MeshSignedEvent {
	/** The Nostr event id the signer computed (sha256 of the serialized event). */
	id: string;
	/** The fully signed + (optionally gift-wrapped) event ready to publish. */
	payload: unknown;
}

/**
 * Injected signer: turn an unsigned event into a signed payload. For outbound the
 * real implementation lives client/worker-side and uses the user's device key;
 * the adapter only shapes + delegates and never does inline crypto. (Inbound mesh
 * decryption is handled separately by the server-escrow relay-watcher, not here.)
 */
export type MeshSignFn = (
	event: MeshUnsignedEvent,
) => Promise<MeshSignedEvent> | MeshSignedEvent;

/** Injected publisher: emit a signed event to the relay pool; return its id. */
export type MeshPublishFn = (
	signed: MeshSignedEvent,
) => Promise<{ id: string }>;

export interface MeshAdapterOptions {
	/** The signing seam (client/worker-owned key). REQUIRED. */
	sign: MeshSignFn;
	/** The relay-pool publish seam. REQUIRED. */
	publish: MeshPublishFn;
	/**
	 * Resolve the author's mesh pubkey so the From identity is the bound device
	 * key. When omitted, the draft's `metadata.fromPubkey` is used.
	 */
	resolveFromPubkey?: (authorUserId: string) => Promise<string | null>;
	/** Default Nostr event kind for outbound DMs (defaults to 14, NIP-17). */
	defaultKind?: number;
	/** Injected clock for `created_at` (tests); defaults to `Date.now`. */
	now?: () => Date;
	/** Mint a fallback id when the publisher echoes none (tests inject a fixed). */
	mintEventId?: () => string;
}

/** NIP-17 sealed direct-message kind. */
const DEFAULT_DM_KIND = 14;

function toDate(value: number | string | undefined): Date {
	if (value === undefined) return new Date();
	// Nostr `created_at` is unix SECONDS; a small number is almost certainly that.
	if (typeof value === "number" && value < 1e12) {
		return new Date(value * 1000);
	}
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? new Date() : d;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class MeshAdapter implements TransportAdapter<MeshRawInbound> {
	readonly kind = "mesh" as const;

	private readonly signFn: MeshSignFn;
	private readonly publishFn: MeshPublishFn;
	private readonly resolveFromPubkey?: (
		authorUserId: string,
	) => Promise<string | null>;
	private readonly defaultKind: number;
	private readonly now: () => Date;
	private readonly mintEventId: () => string;

	constructor(opts: MeshAdapterOptions) {
		this.signFn = opts.sign;
		this.publishFn = opts.publish;
		this.resolveFromPubkey = opts.resolveFromPubkey;
		this.defaultKind = opts.defaultKind ?? DEFAULT_DM_KIND;
		this.now = opts.now ?? (() => new Date());
		this.mintEventId = opts.mintEventId ?? (() => crypto.randomUUID());
	}

	/**
	 * Translate the bridge's destructured Nostr event into the hub-neutral message
	 * shape. `externalId` is the Nostr event id so the router dedups on
	 * `(mesh, eventId)`; pubkeys are normalized so two encodings of the same key
	 * thread together.
	 */
	normalizeInbound(raw: MeshRawInbound): NormalizedMessage {
		const from = this.safeNormalize(raw.fromPubkey);
		const to = this.safeNormalize(raw.toPubkey);

		return {
			transport: "mesh",
			externalId: raw.eventId ?? null,
			inReplyToExternalId: raw.replyToEventId ?? null,
			from,
			to: [to],
			subject: raw.subject ?? null,
			body: raw.body,
			bodyHtml: null,
			attachments: [],
			createdAt: toDate(raw.sentAt),
			metadata: {
				transport: "mesh",
				fromPubkey: from,
				toPubkey: to,
				thread: raw.thread ?? null,
				kind: raw.kind ?? this.defaultKind,
				eventId: raw.eventId ?? null,
				relayUrl: raw.relayUrl ?? null,
				provider: "nostr-bridge",
			},
		};
	}

	/**
	 * Build the unsigned event, sign it via the injected signer (NO inline
	 * crypto), publish it via the injected publisher, and return the published
	 * event id as the provider id so the router records it on the delivery row.
	 */
	async send(draft: OutboundDraft, ctx: SendContext): Promise<SendResult> {
		const fromPubkey = await this.resolveFrom(draft);
		const meta = draft.metadata ?? {};

		const unsigned: MeshUnsignedEvent = {
			fromPubkey,
			toPubkey: this.safeNormalize(ctx.toAddress),
			kind: this.defaultKind,
			body: draft.body,
			createdAt: Math.floor(this.now().getTime() / 1000),
			...(readString(meta.thread) ? { thread: readString(meta.thread) } : {}),
			...(readString(meta.replyToEventId)
				? { replyToEventId: readString(meta.replyToEventId) }
				: {}),
		};

		const signed = await this.signFn(unsigned);
		const { id } = await this.publishFn(signed);
		// Prefer the relay-accepted id; fall back to the signer id, then a mint.
		return { providerId: id || signed.id || this.mintEventId() };
	}

	/** Resolve the outbound From pubkey (the author's bound device key). */
	private async resolveFrom(draft: OutboundDraft): Promise<string> {
		if (this.resolveFromPubkey) {
			const pubkey = await this.resolveFromPubkey(draft.authorUserId);
			if (pubkey) return this.safeNormalize(pubkey);
		}
		const metaFrom = readString(draft.metadata?.fromPubkey);
		if (metaFrom) return this.safeNormalize(metaFrom);
		throw new Error(
			"MeshAdapter.send: no author pubkey (provide resolveFromPubkey or metadata.fromPubkey)",
		);
	}

	/** Normalize a pubkey, falling back to a lowercased trim on malformed input. */
	private safeNormalize(pubkey: string): string {
		try {
			return normalizeNostrPubkey(pubkey);
		} catch {
			return pubkey.trim().toLowerCase();
		}
	}
}
