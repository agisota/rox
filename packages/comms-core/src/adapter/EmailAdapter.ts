/**
 * `EmailAdapter` — the email {@link TransportAdapter} for D3 (`<handle>@rox.one`).
 *
 * Pure translation, like every other adapter: it never persists `comms_*` /
 * `mail_*` rows and never imports a db client. The two transport side-effects it
 * needs — actually sending via Resend and (optionally) streaming the raw `.eml`
 * to R2 — are INJECTED as plain functions, so the adapter unit-tests with fakes
 * and stays inert without real keys.
 *
 *  - `normalizeInbound` parses a compact inbound email envelope (the JSON the
 *    Cloudflare Email Worker POSTs to `/api/mail/inbound`) into the hub-neutral
 *    {@link NormalizedMessage} shape so the {@link MessageRouter} threads + dedups
 *    it uniformly (transport = `email`).
 *  - `send` builds an RFC-compliant outbound payload (From `<handle>@rox.one`,
 *    Reply-To, In-Reply-To / References threading) and hands it to the injected
 *    Resend send fn. Returns the provider id (Resend `email_id`).
 */

import type {
	CommsAttachment,
	NormalizedMessage,
	OutboundDraft,
} from "../types";
import type {
	SendContext,
	SendResult,
	TransportAdapter,
} from "./TransportAdapter";

// ---------------------------------------------------------------------------
// Inbound envelope (Cloudflare Email Worker → /api/mail/inbound body)
// ---------------------------------------------------------------------------

/** Tri-state per-check verdict (`pass`/`fail`/`unknown`). */
export type EmailAuthVerdict = "pass" | "fail" | "unknown";

/**
 * SPF/DKIM/DMARC verdicts the edge Worker reports from the inbound SMTP auth.
 *
 * SECURITY (PR #335 review): a verdict is only safe to trust when it was stamped
 * by an allowlisted receiver identity (Cloudflare's own Authentication-Results
 * authserv-id). A sender can forge `Authentication-Results: ...; dmarc=pass` on
 * their own message, so the Worker reports `trusted: false` when it could not
 * find an allowlisted authserv-id, and downstream scoring treats every untrusted
 * "pass" as unverified. `unknown` means the check was absent / not evaluated.
 */
export interface EmailAuthResult {
	spf: EmailAuthVerdict;
	dkim: EmailAuthVerdict;
	dmarc: EmailAuthVerdict;
	/** True only when the verdicts came from an allowlisted authserv-id. */
	trusted: boolean;
}

/** Per-attachment pointer the Worker streamed to R2 before POSTing. */
export interface EmailInboundAttachment {
	filename: string;
	contentType: string;
	sizeBytes: number;
	contentId?: string | null;
	isInline?: boolean;
	/** R2 object key (`mail/att/<owner>/<uuid>`). Body never travels inline. */
	blobKey: string;
}

/**
 * The compact JSON envelope the Worker signs + POSTs. Bodies/attachments are
 * already in R2; this is metadata + object keys only (DQ1).
 */
export interface EmailRawInbound {
	rcptTo: string;
	mailFrom: string;
	fromName?: string | null;
	messageId: string;
	inReplyTo?: string | null;
	references?: string[];
	subject?: string | null;
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string | null;
	rawSize: number;
	/** R2 object key for the full `.eml`. */
	rawBlobKey: string;
	/** R2 object key for the extracted text/plain body, if the Worker wrote one. */
	bodyTextKey?: string | null;
	/** R2 object key for the sanitized text/html body, if any. */
	bodyHtmlKey?: string | null;
	/** First ~200 chars of plaintext, for list view (NOT the body). */
	snippet?: string | null;
	auth: EmailAuthResult;
	attachments?: EmailInboundAttachment[];
	hasCalendarInvite?: boolean;
	/** Provider-reported receive time (ms epoch or ISO); defaults to now. */
	receivedAt?: number | string;
}

// ---------------------------------------------------------------------------
// Outbound payload (adapter → injected Resend send fn)
// ---------------------------------------------------------------------------

/**
 * One outbound attachment in the Resend-shaped payload (FN-141 / #701).
 * Resend accepts either inline `content` (base64/Buffer) or a remote `path`
 * (a URL it fetches). Mail attachments live in R2, so the router supplies a
 * short-TTL presigned GET URL as `path` — bytes are never inlined into the
 * payload (mirrors DQ1: bodies/attachments stay in R2).
 */
export interface EmailOutboundAttachment {
	/** Filename shown to the recipient. */
	filename: string;
	/** Remote URL Resend fetches the bytes from (a presigned R2 GET). */
	path?: string;
	/** Inline content, when not delivered by URL. */
	content?: string;
	/** Optional explicit content type. */
	contentType?: string;
}

/** The RFC-shaped payload the adapter hands the injected Resend send fn. */
export interface EmailOutboundPayload {
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	subject: string;
	text: string;
	html?: string;
	/** Threading headers so replies thread in the recipient's client. */
	headers?: Record<string, string>;
	/** Outbound attachments (URL-delivered from R2; FN-141 / #701). */
	attachments?: EmailOutboundAttachment[];
}

/** Injected transport: send the payload, return the provider message id. */
export type ResendSendFn = (
	payload: EmailOutboundPayload,
) => Promise<{ id: string }>;

export interface EmailAdapterOptions {
	/** The send seam (a thin wrapper over `resend.emails.send`). REQUIRED. */
	send: ResendSendFn;
	/** Sending domain for the From localpart; defaults to `rox.one`. */
	domain?: string;
	/**
	 * Resolve the rox handle for the outbound author so From is
	 * `<handle>@rox.one`. When omitted, the draft's `metadata.fromAddress` is
	 * used, falling back to `no-reply@<domain>`.
	 */
	resolveFromAddress?: (authorUserId: string) => Promise<string | null>;
}

const DEFAULT_DOMAIN = "rox.one";

function toDate(value: number | string | undefined): Date {
	if (value === undefined) return new Date();
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Strip `re:`/`fwd:` prefixes + collapse whitespace for fallback grouping. */
export function normalizeSubject(subject: string | null | undefined): string {
	if (!subject) return "";
	return subject
		.replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "")
		.trim()
		.toLowerCase();
}

export class EmailAdapter implements TransportAdapter<EmailRawInbound> {
	readonly kind = "email" as const;

	private readonly sendFn: ResendSendFn;
	private readonly domain: string;
	private readonly resolveFromAddress?: (
		authorUserId: string,
	) => Promise<string | null>;

	constructor(opts: EmailAdapterOptions) {
		this.sendFn = opts.send;
		this.domain = opts.domain ?? DEFAULT_DOMAIN;
		this.resolveFromAddress = opts.resolveFromAddress;
	}

	/**
	 * Translate the Worker's signed envelope into the hub-neutral message shape.
	 * The `externalId` is the RFC Message-ID so the router dedups on
	 * `(email, Message-ID)`; body pointers travel as metadata (bodies are in R2).
	 */
	normalizeInbound(raw: EmailRawInbound): NormalizedMessage {
		const attachments: CommsAttachment[] = (raw.attachments ?? []).map((a) => ({
			name: a.filename,
			url: a.blobKey,
			contentType: a.contentType,
			size: a.sizeBytes,
		}));

		return {
			transport: "email",
			externalId: raw.messageId,
			inReplyToExternalId: raw.inReplyTo ?? null,
			from: raw.mailFrom.trim().toLowerCase(),
			to: raw.to.map((t) => t.trim().toLowerCase()),
			subject: raw.subject ?? null,
			// The plaintext body lives in R2; the hub row carries the snippet + the
			// body object keys in metadata so the inbox list view never needs R2.
			body: raw.snippet ?? "",
			bodyHtml: null,
			attachments,
			createdAt: toDate(raw.receivedAt),
			metadata: {
				rcptTo: raw.rcptTo.trim().toLowerCase(),
				fromName: raw.fromName ?? null,
				cc: raw.cc ?? [],
				bcc: raw.bcc ?? [],
				replyTo: raw.replyTo ?? null,
				references: raw.references ?? [],
				rawSize: raw.rawSize,
				rawBlobKey: raw.rawBlobKey,
				bodyTextKey: raw.bodyTextKey ?? null,
				bodyHtmlKey: raw.bodyHtmlKey ?? null,
				subjectNorm: normalizeSubject(raw.subject),
				auth: raw.auth,
				hasAttachments: attachments.length > 0,
				hasCalendarInvite: raw.hasCalendarInvite ?? false,
				provider: "cloudflare",
			},
		};
	}

	/**
	 * Build the outbound RFC payload and send it via the injected Resend fn. From
	 * is the author's `<handle>@rox.one`; threading headers (In-Reply-To /
	 * References) are carried on the draft metadata so replies thread externally.
	 */
	async send(draft: OutboundDraft, ctx: SendContext): Promise<SendResult> {
		const from = await this.resolveFrom(draft);
		const meta = draft.metadata ?? {};

		const headers: Record<string, string> = {};
		const inReplyTo = readString(meta.inReplyTo);
		if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
		const references = readStringArray(meta.references);
		if (references.length > 0) headers.References = references.join(" ");

		const cc = readStringArray(meta.cc);
		const bcc = readStringArray(meta.bcc);
		const replyTo = readString(meta.replyTo);
		const attachments = readAttachments(meta.attachments);

		const payload: EmailOutboundPayload = {
			from,
			to: [ctx.toAddress],
			...(cc.length > 0 ? { cc } : {}),
			...(bcc.length > 0 ? { bcc } : {}),
			...(replyTo ? { replyTo } : {}),
			subject: draft.subject ?? readString(meta.subject) ?? "(no subject)",
			text: draft.body,
			...(draft.bodyHtml ? { html: draft.bodyHtml } : {}),
			...(Object.keys(headers).length > 0 ? { headers } : {}),
			...(attachments.length > 0 ? { attachments } : {}),
		};

		const { id } = await this.sendFn(payload);
		return { providerId: id };
	}

	/** Resolve the outbound From address (`<handle>@rox.one`). */
	private async resolveFrom(draft: OutboundDraft): Promise<string> {
		if (this.resolveFromAddress) {
			const resolved = await this.resolveFromAddress(draft.authorUserId);
			if (resolved) return resolved.trim().toLowerCase();
		}
		const metaFrom = readString(draft.metadata?.fromAddress);
		if (metaFrom) return metaFrom.trim().toLowerCase();
		return `no-reply@${this.domain}`;
	}
}

// ---------------------------------------------------------------------------
// metadata readers — narrow `unknown` jsonb values without `any`
// ---------------------------------------------------------------------------

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === "string");
}

/**
 * Narrow a jsonb `attachments` value into the Resend-shaped outbound attachment
 * list (FN-141 / #701). Each entry needs a `filename` plus a delivery source
 * (`path` URL or inline `content`); entries missing both are dropped so a
 * malformed metadata value can never produce an attachment with no bytes.
 */
function readAttachments(value: unknown): EmailOutboundAttachment[] {
	if (!Array.isArray(value)) return [];
	const out: EmailOutboundAttachment[] = [];
	for (const raw of value) {
		if (typeof raw !== "object" || raw === null) continue;
		const rec = raw as Record<string, unknown>;
		const filename = readString(rec.filename);
		const path = readString(rec.path);
		const content = readString(rec.content);
		if (!filename || (!path && !content)) continue;
		out.push({
			filename,
			...(path ? { path } : {}),
			...(content ? { content } : {}),
			...(readString(rec.contentType)
				? { contentType: rec.contentType as string }
				: {}),
		});
	}
	return out;
}
