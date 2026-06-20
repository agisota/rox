/**
 * The `TransportAdapter` contract (D1 §6).
 *
 * Every comms transport (in-app, email/D2, XMPP/D3, mesh/D5) implements this
 * one interface; the hub then gets uniform threading, idempotency, presence
 * merge, and inbox surfacing "for free". Adapters are pure translation layers:
 * raw provider payload ⇄ {@link NormalizedMessage}, plus an outbound `send`.
 * They do NOT persist `comms_*` rows — the {@link MessageRouter} owns that via
 * injected ports.
 */

import type {
	CommsDelivery,
	CommsTransport,
	DerivedAddresses,
	NormalizedMessage,
	OutboundDraft,
} from "../types";

/** Result of an outbound send for one recipient/transport. */
export interface SendResult {
	/** Provider/transport message id once accepted (e.g. Resend id, stanza id). */
	providerId: string;
}

/** Context handed to {@link TransportAdapter.send} for one recipient. */
export interface SendContext {
	/** Resolved destination address for this recipient. */
	toAddress: string;
	/** The delivery row this send corresponds to, for status correlation. */
	delivery: Pick<CommsDelivery, "id" | "messageId" | "transport">;
}

/**
 * A transport adapter — the single seam every comms domain plugs into.
 *
 * `RawInbound` is the transport-specific inbound payload type (an email
 * webhook body, an XMPP stanza, a Nostr event). Defaults to `unknown` so the
 * registry can hold adapters of differing payload shapes.
 */
export interface TransportAdapter<RawInbound = unknown> {
	/** Discriminator — which transport this adapter speaks. */
	readonly kind: CommsTransport;

	/**
	 * Translate a raw inbound provider payload into the hub's neutral message
	 * shape. MUST surface a stable `externalId` when the transport provides one
	 * so the router can dedup on `(transport, external_id)`.
	 */
	normalizeInbound(
		raw: RawInbound,
	): NormalizedMessage | Promise<NormalizedMessage>;

	/**
	 * Deliver one message to one recipient over this transport. Returns the
	 * provider id; the router records it on the delivery row.
	 */
	send(draft: OutboundDraft, ctx: SendContext): Promise<SendResult>;

	/**
	 * Optional provisioning hook called by `provisionIdentity` when a handle is
	 * claimed/changed — XMPP creates the JID account, mesh creates the keypair,
	 * etc. May mutate `addresses.mesh` etc. via its own side channel; returns the
	 * (possibly enriched) addresses for this transport.
	 */
	provisionAddress?(
		userId: string,
		handle: string,
		addresses: DerivedAddresses,
	): Promise<Partial<DerivedAddresses>>;

	/**
	 * Optional presence probe — returns this transport's current view of a
	 * user's presence, feeding the aggregator. Omitted for transports without a
	 * live presence signal (e.g. email).
	 */
	presenceFor?(userId: string): Promise<{
		state: "online" | "away" | "dnd" | "offline";
		at: Date;
	} | null>;
}
