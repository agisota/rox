/**
 * `XmppAdapter` — the XMPP {@link TransportAdapter} for D4 (`<handle>@xmpp.rox.one`).
 *
 * Pure translation, like every other adapter: it never persists `comms_*` /
 * `xmpp_*` rows and never opens an XMPP connection. The one transport
 * side-effect it needs — actually emitting a stanza onto the bridge component —
 * is INJECTED as a plain function (`XmppSendFn`), so the adapter unit-tests with
 * a fake and stays inert without a live ejabberd.
 *
 *  - `normalizeInbound` parses the compact JSON event the XEP-0114 bridge POSTs
 *    to `/api/xmpp/inbound` (a `<message>` stanza already destructured) into the
 *    hub-neutral {@link NormalizedMessage} shape so the {@link MessageRouter}
 *    threads + dedups it uniformly (transport = `xmpp`). The dedup `externalId`
 *    is the XEP-0359 origin/stanza id.
 *  - `send` builds the stanza payload the bridge will serialize and route as
 *    `<handle>@xmpp.rox.one` → the recipient bare JID, carrying XEP-0359 ids and
 *    a conversation `thread` so replies thread on both sides. It returns the
 *    provider id (the origin id the bridge echoes back).
 *
 * Bodies of bridged conversations are owned by the D1 hub (`comms_messages`);
 * the `xmpp_offline_queue` is only a transient relay buffer (handled in the API
 * layer, not here).
 */

import { bareJid, deriveJid, ROX_XMPP_DOMAIN } from "../identity/jid";
import type { NormalizedMessage, OutboundDraft } from "../types";
import type {
	SendContext,
	SendResult,
	TransportAdapter,
} from "./TransportAdapter";

// ---------------------------------------------------------------------------
// Inbound event (XEP-0114 bridge → /api/xmpp/inbound body)
// ---------------------------------------------------------------------------

/**
 * The compact JSON event the bridge signs + POSTs. A `<message>` stanza already
 * destructured into fields; the bridge owns the XML, the hub owns the meaning.
 */
export interface XmppRawInbound {
	/** Sender bare/full JID (`bob@external.org`), normalized by the adapter. */
	from: string;
	/** Recipient bare JID (`<handle>@xmpp.rox.one`). */
	to: string;
	/** Stanza body (plaintext). */
	body: string;
	/** XEP-0359 stanza/origin id — the dedup key. */
	stanzaId?: string | null;
	/** XEP-0201 conversation thread id, if the sender set one. */
	thread?: string | null;
	/** The stanza this is a reply to (XEP-0461 / in-reply-to), if any. */
	replyToStanzaId?: string | null;
	/** Optional human subject (rare for 1:1 chat; carried when present). */
	subject?: string | null;
	/** Stanza `type` attribute (chat | normal | groupchat | headline | error). */
	stanzaType?: string | null;
	/** Provider-reported delay/receive time (ms epoch or ISO); defaults to now. */
	sentAt?: number | string;
}

// ---------------------------------------------------------------------------
// Outbound payload (adapter → injected bridge send fn)
// ---------------------------------------------------------------------------

/** The stanza-shaped payload the adapter hands the injected bridge send fn. */
export interface XmppOutboundPayload {
	/** From bare JID — the author's `<handle>@xmpp.rox.one`. */
	from: string;
	/** To bare JID — the recipient (rox or remote). */
	to: string;
	/** `<message>` type; rox 1:1 federation uses `chat`. */
	type: "chat";
	body: string;
	/** XEP-0359 origin id minted for this stanza (also the dedup/provider id). */
	originId: string;
	/** XEP-0201 conversation thread id, carried for cross-side threading. */
	thread?: string;
	/** The stanza id this replies to, if threading off an inbound. */
	replyToStanzaId?: string;
}

/** Injected transport: emit the stanza onto the bridge, return the routed id. */
export type XmppSendFn = (
	payload: XmppOutboundPayload,
) => Promise<{ id: string }>;

export interface XmppAdapterOptions {
	/** The send seam (a thin wrapper over the bridge component). REQUIRED. */
	send: XmppSendFn;
	/** XMPP service domain for the From localpart; defaults to `xmpp.rox.one`. */
	domain?: string;
	/**
	 * Resolve the rox handle for the outbound author so From is the bound JID.
	 * When omitted, the draft's `metadata.fromJid` is used, falling back to a
	 * bridge JID `bridge@<domain>`.
	 */
	resolveFromHandle?: (authorUserId: string) => Promise<string | null>;
	/**
	 * Mint a fresh XEP-0359 origin id for an outbound stanza. Injected so the
	 * adapter stays pure/deterministic in tests; defaults to `crypto.randomUUID`.
	 */
	mintOriginId?: () => string;
}

function toDate(value: number | string | undefined): Date {
	if (value === undefined) return new Date();
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? new Date() : d;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class XmppAdapter implements TransportAdapter<XmppRawInbound> {
	readonly kind = "xmpp" as const;

	private readonly sendFn: XmppSendFn;
	private readonly domain: string;
	private readonly resolveFromHandle?: (
		authorUserId: string,
	) => Promise<string | null>;
	private readonly mintOriginId: () => string;

	constructor(opts: XmppAdapterOptions) {
		this.sendFn = opts.send;
		this.domain = (opts.domain ?? ROX_XMPP_DOMAIN).trim().toLowerCase();
		this.resolveFromHandle = opts.resolveFromHandle;
		this.mintOriginId = opts.mintOriginId ?? (() => crypto.randomUUID());
	}

	/**
	 * Translate the bridge's destructured `<message>` event into the hub-neutral
	 * message shape. `externalId` is the XEP-0359 stanza id so the router dedups
	 * on `(xmpp, stanzaId)`; JIDs are bare-normalized so a resourceful inbound
	 * (`bob@x/phone`) threads with the bare contact.
	 */
	normalizeInbound(raw: XmppRawInbound): NormalizedMessage {
		const from = bareJid(raw.from) ?? raw.from.trim().toLowerCase();
		const to = bareJid(raw.to) ?? raw.to.trim().toLowerCase();

		return {
			transport: "xmpp",
			externalId: raw.stanzaId ?? null,
			inReplyToExternalId: raw.replyToStanzaId ?? null,
			from,
			to: [to],
			subject: raw.subject ?? null,
			body: raw.body,
			bodyHtml: null,
			attachments: [],
			createdAt: toDate(raw.sentAt),
			metadata: {
				transport: "xmpp",
				fromJid: from,
				toJid: to,
				// XEP-0201 conversation thread, kept so a future outbound reply can
				// carry the same `thread` back to the remote client.
				thread: raw.thread ?? null,
				stanzaType: raw.stanzaType ?? "chat",
				stanzaId: raw.stanzaId ?? null,
				provider: "xmpp-bridge",
			},
		};
	}

	/**
	 * Build the outbound stanza payload and emit it via the injected bridge send
	 * fn. From is the author's bound JID (`<handle>@xmpp.rox.one`); a fresh
	 * XEP-0359 origin id is minted and returned as the provider id so the router
	 * records it on the delivery row.
	 */
	async send(draft: OutboundDraft, ctx: SendContext): Promise<SendResult> {
		const from = await this.resolveFrom(draft);
		const meta = draft.metadata ?? {};
		const originId = this.mintOriginId();

		const payload: XmppOutboundPayload = {
			from,
			to: bareJid(ctx.toAddress) ?? ctx.toAddress.trim().toLowerCase(),
			type: "chat",
			body: draft.body,
			originId,
			...(readString(meta.thread) ? { thread: readString(meta.thread) } : {}),
			...(readString(meta.replyToStanzaId)
				? { replyToStanzaId: readString(meta.replyToStanzaId) }
				: {}),
		};

		const { id } = await this.sendFn(payload);
		// Prefer the bridge-echoed id; fall back to the locally minted origin id.
		return { providerId: id || originId };
	}

	/** Resolve the outbound From JID (`<handle>@xmpp.rox.one`). */
	private async resolveFrom(draft: OutboundDraft): Promise<string> {
		if (this.resolveFromHandle) {
			const handle = await this.resolveFromHandle(draft.authorUserId);
			if (handle) return deriveJid(handle, this.domain);
		}
		const metaFrom = readString(draft.metadata?.fromJid);
		if (metaFrom) return bareJid(metaFrom) ?? metaFrom.trim().toLowerCase();
		return `bridge@${this.domain}`;
	}
}
