/**
 * Inbound mail ingest (D3 P3, T6–T8).
 *
 * The signed envelope the Cloudflare Email Worker POSTs to `/api/mail/inbound`
 * (after streaming the raw `.eml` + attachments to R2) is turned into durable
 * rows here:
 *
 *   1. resolve `rcptTo` (`<handle>@rox.one`) → the owning rox user via
 *      `mail_addresses` (primary OR a `grace` alias inside its window);
 *   2. score spam from the edge SPF/DKIM/DMARC verdicts + light heuristics —
 *      at/above the threshold the message is `quarantined` (NOT emitted to D1);
 *   3. upsert `mail_threads` (by References/In-Reply-To root, else subject-norm)
 *      + `mail_messages` (idempotent on `(owner, Message-ID)`) + `mail_attachments`
 *      (pointers only — bodies stay in R2);
 *   4. on accepted, non-quarantined inbound, emit a unified-inbox envelope into
 *      D1 (`comms_messages` + `comms_threads`, transport = `email`).
 *
 * The db handle is INJECTED (`MailIngestDb`) so this orchestration unit-tests
 * against an in-memory fake with no live database — the route passes the real
 * Drizzle `db`.
 */

import {
	type EmailRawInbound,
	normalizeSubject,
	scoreInboundSpam,
} from "@rox/comms-core";

/** Outcome the route maps onto an HTTP status. */
export type IngestResult =
	| { kind: "accepted"; messageId: string; threadId: string }
	| { kind: "quarantined"; messageId: string; spamScore: number }
	| { kind: "duplicate"; messageId: string }
	| { kind: "no_such_handle" };

type AnyRow = Record<string, unknown>;

/**
 * The narrow db surface ingest needs. Structurally satisfied by both the real
 * Drizzle client and the test fake. Reads return a single row or null; writes
 * return the inserted row.
 */
export interface MailIngestDb {
	/** Find the active/grace address row owning `<handle>@rox.one`. */
	findAddressByValue(address: string): Promise<{
		id: string;
		userId: string;
		organizationId: string;
		status: string;
		graceUntil: Date | null;
	} | null>;

	/** Lookup an existing mail message by (owner, Message-ID) for dedup. */
	findMessageByMsgId(args: {
		ownerUserId: string;
		rfcMessageId: string;
	}): Promise<{ id: string; threadId: string | null } | null>;

	/** Find a mail thread by its root message ref or normalized subject. */
	findThread(args: {
		ownerUserId: string;
		rootMessageRef: string | null;
		subjectNorm: string | null;
	}): Promise<{ id: string } | null>;

	/** Create a mail thread, returning its id. */
	createThread(args: {
		organizationId: string;
		ownerUserId: string;
		rootMessageRef: string | null;
		subjectNorm: string | null;
		lastMessageAt: Date;
	}): Promise<{ id: string }>;

	/** Bump a thread's last-message timestamp + message count. */
	touchThread(args: { threadId: string; lastMessageAt: Date }): Promise<void>;

	/** Insert the mail message envelope, returning its id. */
	insertMessage(row: AnyRow): Promise<{ id: string }>;

	/** Insert attachment pointer rows (no-op when empty). */
	insertAttachments(rows: AnyRow[]): Promise<void>;

	/** Emit the unified-inbox (D1) envelope for accepted, non-quarantined mail. */
	emitToUnifiedInbox(args: {
		organizationId: string;
		ownerUserId: string;
		fromAddr: string;
		toAddrs: string[];
		subject: string | null;
		snippet: string;
		rfcMessageId: string | null;
		inReplyTo: string | null;
		mailMessageId: string;
	}): Promise<void>;
}

export interface IngestOptions {
	/** Override the spam threshold (defaults to the comms-core default). */
	spamThreshold?: number;
	/** Clock injection for the grace-window check (tests). */
	now?: () => Date;
}

/**
 * Ingest one inbound email envelope. Idempotent on `(owner, Message-ID)`: a
 * redelivered Worker POST returns `duplicate` without re-inserting.
 */
export async function ingestInboundMail(
	db: MailIngestDb,
	raw: EmailRawInbound,
	opts: IngestOptions = {},
): Promise<IngestResult> {
	const now = opts.now ?? (() => new Date());

	// 1. Resolve the recipient handle → owning rox user.
	const rcptTo = raw.rcptTo.trim().toLowerCase();
	const address = await db.findAddressByValue(rcptTo);
	if (!address || address.status === "disabled") {
		return { kind: "no_such_handle" };
	}
	// A grace alias only resolves inside its window (DQ4).
	if (
		address.status === "grace" &&
		address.graceUntil &&
		address.graceUntil.getTime() < now().getTime()
	) {
		return { kind: "no_such_handle" };
	}

	const ownerUserId = address.userId;
	const organizationId = address.organizationId;
	const rfcMessageId = raw.messageId;

	// 2. Idempotency gate on (owner, Message-ID).
	if (rfcMessageId) {
		const existing = await db.findMessageByMsgId({ ownerUserId, rfcMessageId });
		if (existing) {
			return { kind: "duplicate", messageId: existing.id };
		}
	}

	// 3. Spam score from the edge auth verdicts + light heuristics.
	const subject = raw.subject ?? null;
	const snippet = raw.snippet ?? "";
	const spam = scoreInboundSpam(
		{
			auth: {
				spf: raw.auth.spf,
				dkim: raw.auth.dkim,
				dmarc: raw.auth.dmarc,
			},
			subject,
			snippet,
			recipientCount:
				raw.to.length + (raw.cc?.length ?? 0) + (raw.bcc?.length ?? 0),
		},
		opts.spamThreshold,
	);

	// 4. Thread resolution (References/In-Reply-To root, else subject-norm).
	const subjectNorm = normalizeSubject(subject);
	const rootMessageRef = raw.references?.[0] ?? raw.inReplyTo ?? rfcMessageId;
	const receivedAt = raw.receivedAt ? new Date(raw.receivedAt) : now();

	const found = await db.findThread({
		ownerUserId,
		rootMessageRef: rootMessageRef ?? null,
		subjectNorm: subjectNorm || null,
	});
	let threadId: string;
	if (found) {
		threadId = found.id;
		await db.touchThread({ threadId, lastMessageAt: receivedAt });
	} else {
		const created = await db.createThread({
			organizationId,
			ownerUserId,
			rootMessageRef: rootMessageRef ?? null,
			subjectNorm: subjectNorm || null,
			lastMessageAt: receivedAt,
		});
		threadId = created.id;
	}

	// 5. Insert the message envelope (body pointers only — bodies are in R2).
	const attachments = raw.attachments ?? [];
	const message = await db.insertMessage({
		organizationId,
		ownerUserId,
		addressId: address.id,
		threadId,
		direction: "inbound",
		status: spam.quarantined ? "quarantined" : "received",
		rfcMessageId: rfcMessageId ?? null,
		inReplyTo: raw.inReplyTo ?? null,
		referencesIds: raw.references ?? null,
		fromAddr: raw.mailFrom.trim().toLowerCase(),
		fromName: raw.fromName ?? null,
		toAddrs: raw.to.map((t) => t.trim().toLowerCase()),
		ccAddrs: raw.cc ?? [],
		bccAddrs: raw.bcc ?? [],
		replyTo: raw.replyTo ?? null,
		subject,
		snippet,
		rawBlobKey: raw.rawBlobKey,
		bodyTextKey: raw.bodyTextKey ?? null,
		bodyHtmlKey: raw.bodyHtmlKey ?? null,
		hasAttachments: attachments.length > 0,
		hasCalendarInvite: raw.hasCalendarInvite ?? false,
		spamScore: spam.score,
		spfPass: raw.auth.spf,
		dkimPass: raw.auth.dkim,
		dmarcPass: raw.auth.dmarc,
		provider: "cloudflare",
		receivedAt,
	});

	// 6. Attachment pointer rows (R2 keys only).
	if (attachments.length > 0) {
		await db.insertAttachments(
			attachments.map((a) => ({
				messageId: message.id,
				organizationId,
				filename: a.filename,
				contentType: a.contentType,
				sizeBytes: a.sizeBytes,
				contentId: a.contentId ?? null,
				isInline: a.isInline ?? false,
				blobKey: a.blobKey,
			})),
		);
	}

	// 7. Quarantined mail is persisted but NEVER surfaced to the D1 inbox.
	if (spam.quarantined) {
		return {
			kind: "quarantined",
			messageId: message.id,
			spamScore: spam.score,
		};
	}

	// 8. Emit the unified-inbox (D1) envelope.
	await db.emitToUnifiedInbox({
		organizationId,
		ownerUserId,
		fromAddr: raw.mailFrom.trim().toLowerCase(),
		toAddrs: raw.to.map((t) => t.trim().toLowerCase()),
		subject,
		snippet,
		rfcMessageId: rfcMessageId ?? null,
		inReplyTo: raw.inReplyTo ?? null,
		mailMessageId: message.id,
	});

	return { kind: "accepted", messageId: message.id, threadId };
}
