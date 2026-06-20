/**
 * Inbound XMPP bridge ingest (D4 Phase 3).
 *
 * The signed event the XEP-0114 bridge component POSTs to `/api/xmpp/inbound`
 * (a `<message>` stanza already destructured) is turned into durable rows here:
 *
 *   1. parse the bridge event into the hub-neutral {@link NormalizedMessage}
 *      shape via the pure `@rox/comms-core` {@link XmppAdapter} (transport=xmpp);
 *   2. resolve the recipient JID (`<handle>@xmpp.rox.one`) -> the owning rox user
 *      via `xmpp_accounts` (active) OR a still-reserved `xmpp_jid_aliases` row
 *      inside its grace window (DQ4);
 *   3. dedup on `(xmpp, stanza_id)` — a redelivered stanza is a no-op;
 *   4. emit a unified-inbox envelope into D1 (`comms_threads` + `comms_messages`,
 *      transport = `xmpp`), find-or-create the thread keyed by the stanza thread
 *      / reply id;
 *   5. buffer the stanza into `xmpp_offline_queue` for store-and-forward (the
 *      bridge drains it when the rox user's live session reconnects).
 *
 * The db handle is INJECTED (`XmppIngestDb`) so this orchestration unit-tests
 * against an in-memory fake with no live database; the route passes the real
 * Drizzle adapter (see `./drizzleDb`).
 */

import { XmppAdapter, type XmppRawInbound } from "@rox/comms-core";

/** Outcome the route maps onto an HTTP status. */
export type XmppIngestResult =
	| { kind: "accepted"; messageId: string; threadId: string }
	| { kind: "duplicate"; stanzaId: string }
	| { kind: "no_such_jid" };

/** A resolved JID binding (active account OR a still-reserved alias owner). */
export interface ResolvedJidAccount {
	accountId: string;
	userId: string;
	organizationId: string;
}

/**
 * The narrow db surface ingest needs. Structurally satisfied by both the real
 * Drizzle adapter and the test fake.
 */
export interface XmppIngestDb {
	/** Resolve a bare recipient JID -> the owning account, or null if unknown. */
	resolveAccountByJid(args: {
		localpart: string;
		domain: string;
		now: Date;
	}): Promise<ResolvedJidAccount | null>;

	/** Has this (xmpp, stanzaId) already been ingested? (idempotency gate) */
	findMessageByStanzaId(stanzaId: string): Promise<{ id: string } | null>;

	/**
	 * Emit the unified-inbox (D1) envelope. Returns the comms message + thread
	 * ids so the relay buffer can correlate.
	 */
	emitToUnifiedInbox(args: {
		organizationId: string;
		toUserId: string;
		fromJid: string;
		toJid: string;
		body: string;
		subject: string | null;
		stanzaId: string | null;
		replyToStanzaId: string | null;
		thread: string | null;
		createdAt: Date;
	}): Promise<{ messageId: string; threadId: string }>;

	/** Buffer the stanza for store-and-forward (idempotent on origin id). */
	enqueueOffline(args: {
		accountId: string;
		fromJid: string;
		toJid: string;
		stanzaKind: string;
		stanza: Record<string, unknown>;
		originId: string | null;
		expiresAt: Date;
	}): Promise<void>;
}

export interface XmppIngestOptions {
	/** Clock injection for the grace-window check + offline TTL (tests). */
	now?: () => Date;
	/** Offline-buffer TTL in ms (default 30 days). */
	offlineTtlMs?: number;
}

/** The XMPP service domain the bridge serves. */
const DEFAULT_OFFLINE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// A pure adapter instance for inbound normalization only — `send` is never
// called here (the bridge owns outbound), so a throwing send fn documents that.
const inboundAdapter = new XmppAdapter({
	send: () => {
		throw new Error("XmppAdapter.send is not used on the inbound ingest path");
	},
});

function splitJid(jid: string): { localpart: string; domain: string } | null {
	const at = jid.indexOf("@");
	if (at <= 0) return null;
	const localpart = jid.slice(0, at);
	const domain = jid.slice(at + 1);
	if (!localpart || !domain) return null;
	return { localpart, domain };
}

/**
 * Ingest one inbound XMPP bridge event. Idempotent on `(xmpp, stanzaId)`: a
 * redelivered bridge POST returns `duplicate` without re-inserting.
 */
export async function ingestInboundXmpp(
	db: XmppIngestDb,
	raw: XmppRawInbound,
	opts: XmppIngestOptions = {},
): Promise<XmppIngestResult> {
	const now = opts.now ?? (() => new Date());
	const offlineTtlMs = opts.offlineTtlMs ?? DEFAULT_OFFLINE_TTL_MS;

	// 1. Normalize via the pure adapter (transport = xmpp, JIDs bare-folded).
	const msg = inboundAdapter.normalizeInbound(raw);
	const toJid = msg.to[0];
	if (!toJid) return { kind: "no_such_jid" };

	// 2. Resolve the recipient JID -> owning rox user.
	const parts = splitJid(toJid);
	if (!parts) return { kind: "no_such_jid" };
	const account = await db.resolveAccountByJid({
		localpart: parts.localpart,
		domain: parts.domain,
		now: now(),
	});
	if (!account) return { kind: "no_such_jid" };

	// 3. Idempotency gate on (xmpp, stanzaId).
	if (msg.externalId) {
		const existing = await db.findMessageByStanzaId(msg.externalId);
		if (existing) return { kind: "duplicate", stanzaId: msg.externalId };
	}

	const thread =
		typeof msg.metadata.thread === "string" ? msg.metadata.thread : null;

	// 4. Emit the unified-inbox (D1) envelope.
	const emitted = await db.emitToUnifiedInbox({
		organizationId: account.organizationId,
		toUserId: account.userId,
		fromJid: msg.from,
		toJid,
		body: msg.body,
		subject: msg.subject,
		stanzaId: msg.externalId,
		replyToStanzaId: msg.inReplyToExternalId,
		thread,
		createdAt: msg.createdAt,
	});

	// 5. Buffer for store-and-forward (idempotent on the stanza id).
	await db.enqueueOffline({
		accountId: account.accountId,
		fromJid: msg.from,
		toJid,
		stanzaKind: "message",
		stanza: {
			body: msg.body,
			subject: msg.subject,
			thread,
			stanzaId: msg.externalId,
			replyToStanzaId: msg.inReplyToExternalId,
			commsMessageId: emitted.messageId,
		},
		originId: msg.externalId,
		expiresAt: new Date(now().getTime() + offlineTtlMs),
	});

	return {
		kind: "accepted",
		messageId: emitted.messageId,
		threadId: emitted.threadId,
	};
}
