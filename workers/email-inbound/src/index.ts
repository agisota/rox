/**
 * Cloudflare Email Worker — D3 per-user email inbound ingest.
 *
 * Catch-all `*@rox.one` is routed here by Cloudflare Email Routing. For each
 * message the Worker:
 *   1. enforces the size cap + default-rejects obvious abuse (oversize);
 *   2. parses the MIME with `postal-mime`;
 *   3. streams the raw `.eml` + each attachment to R2 (zero-egress, same CF
 *      account as the API + Drive);
 *   4. HMAC-signs a compact JSON envelope (metadata + R2 keys only — no bodies);
 *   5. POSTs it to the Rox API `/api/mail/inbound` with signature + timestamp +
 *      nonce headers.
 *
 * The Worker stays a THIN, signed ingester: no Neon driver, no spam quarantine
 * decision (that happens API-side so the message is always kept). STANDALONE —
 * deployed manually with wrangler; not part of the bun/turbo workspace.
 */

import PostalMime from "postal-mime";

interface Env {
	MAIL_BUCKET: R2Bucket;
	ROX_API_URL: string;
	MAIL_DOMAIN: string;
	MAX_INBOUND_BYTES: string;
	MAIL_INBOUND_SECRET: string;
	/**
	 * Comma-separated allowlist of trusted `Authentication-Results` authserv-ids
	 * (the token before the first `;`). Only a header stamped by one of these is
	 * trusted; sender-supplied Authentication-Results are ignored. Defaults to
	 * `MAIL_DOMAIN` (the rox.one receiving identity Cloudflare stamps).
	 */
	CF_AUTHSERV_ID?: string;
}

/** The compact envelope the API expects (mirrors EmailRawInbound). */
interface InboundEnvelope {
	rcptTo: string;
	mailFrom: string;
	fromName: string | null;
	messageId: string;
	inReplyTo: string | null;
	references: string[];
	subject: string | null;
	to: string[];
	cc: string[];
	bcc: string[];
	replyTo: string | null;
	rawSize: number;
	rawBlobKey: string;
	bodyTextKey: string | null;
	bodyHtmlKey: string | null;
	snippet: string | null;
	auth: {
		spf: AuthVerdict;
		dkim: AuthVerdict;
		dmarc: AuthVerdict;
		/** True only when a trusted (allowlisted authserv-id) header was found. */
		trusted: boolean;
	};
	attachments: Array<{
		filename: string;
		contentType: string;
		sizeBytes: number;
		contentId: string | null;
		isInline: boolean;
		blobKey: string;
	}>;
	hasCalendarInvite: boolean;
	receivedAt: number;
}

/** Lowercase hex encode. */
function toHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}

/** `hex(HMAC-SHA256(secret, body))` using Web Crypto. */
async function hmacSign(secret: string, body: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
	return toHex(sig);
}

/** Tri-state SPF/DKIM/DMARC verdict. */
type AuthVerdict = "pass" | "fail" | "unknown";

/**
 * Split a possibly comma-joined `Authentication-Results` header value into its
 * individual header instances.
 *
 * The Fetch `Headers` API concatenates repeated headers with `", "`, but an
 * Authentication-Results value legitimately contains commas (between methods).
 * Cloudflare prepends its own freshly-stamped header, so we split on the
 * boundary that starts a new authserv-id: a comma/newline immediately followed
 * by `authserv-id;` (a token then a semicolon) at the start of a result.
 * Conservative — when in doubt we keep the chunk intact (it just won't match the
 * allowlist and is ignored).
 */
function splitAuthResults(raw: string): string[] {
	return raw
		.split(/\r?\n/)
		.flatMap((line) => line.split(/,(?=\s*[^;,\s]+\s*;)/))
		.map((s) => s.trim())
		.filter(Boolean);
}

/** The authserv-id is the token before the first `;`. */
function authServId(headerValue: string): string {
	const semi = headerValue.indexOf(";");
	const head = (semi === -1 ? headerValue : headerValue.slice(0, semi)).trim();
	// Strip any trailing `1` version token (`authserv-id 1; ...`).
	return head.split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** Extract a method verdict (`spf=pass` → "pass") from a result header. */
function methodVerdict(headerValue: string, method: string): AuthVerdict {
	const m = new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, "i").exec(headerValue);
	if (!m) return "unknown";
	const v = m[1]?.toLowerCase();
	if (v === "pass") return "pass";
	if (
		v === "fail" ||
		v === "softfail" ||
		v === "permerror" ||
		v === "temperror"
	)
		return "fail";
	return "unknown";
}

/**
 * Read the SPF/DKIM/DMARC verdicts from the Authentication-Results header
 * Cloudflare stamps with ITS OWN authserv-id.
 *
 * SECURITY (PR #335 review): a sender can forge their own
 * `Authentication-Results: evil.example; spf=pass; dkim=pass; dmarc=pass` inside
 * the message. We therefore parse ALL Authentication-Results headers and only
 * trust the one whose authserv-id is in the configured allowlist
 * (`CF_AUTHSERV_ID`, default `MAIL_DOMAIN`). Every other header is ignored. If no
 * trusted header is present we report `unknown`/`trusted:false` — NEVER a pass
 * derived from a sender-supplied header.
 */
function readAuth(
	message: ForwardableEmailMessage,
	env: Env,
): InboundEnvelope["auth"] {
	const allowed = new Set(
		(env.CF_AUTHSERV_ID ?? env.MAIL_DOMAIN ?? "rox.one")
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);

	const rawHeader = message.headers.get("authentication-results") ?? "";
	const candidates = splitAuthResults(rawHeader);
	const trustedHeader = candidates.find((c) => allowed.has(authServId(c)));

	if (!trustedHeader) {
		// No allowlisted authserv-id stamped the message — treat everything as
		// unknown and untrusted. Sender-supplied headers are never trusted.
		return {
			spf: "unknown",
			dkim: "unknown",
			dmarc: "unknown",
			trusted: false,
		};
	}

	return {
		spf: methodVerdict(trustedHeader, "spf"),
		dkim: methodVerdict(trustedHeader, "dkim"),
		dmarc: methodVerdict(trustedHeader, "dmarc"),
		trusted: true,
	};
}

function uuid(): string {
	return crypto.randomUUID();
}

export default {
	async email(
		message: ForwardableEmailMessage,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<void> {
		const maxBytes = Number(env.MAX_INBOUND_BYTES) || 26_214_400;
		if (message.rawSize > maxBytes) {
			message.setReject("Message exceeds the maximum accepted size");
			return;
		}

		// Buffer the raw stream once (we both store it and parse it).
		const rawBytes = new Uint8Array(
			await new Response(message.raw).arrayBuffer(),
		);

		const parsed = await PostalMime.parse(rawBytes);

		const rcptTo = message.to.trim().toLowerCase();
		const ownerSlug = rcptTo.split("@")[0] || "unknown";

		// Stream the raw .eml to R2.
		const rawBlobKey = `mail/raw/${ownerSlug}/${uuid()}.eml`;
		await env.MAIL_BUCKET.put(rawBlobKey, rawBytes, {
			httpMetadata: { contentType: "message/rfc822" },
		});

		// Stream each attachment to R2; collect pointers.
		const attachments: InboundEnvelope["attachments"] = [];
		for (const att of parsed.attachments ?? []) {
			const blobKey = `mail/att/${ownerSlug}/${uuid()}`;
			const content =
				typeof att.content === "string"
					? new TextEncoder().encode(att.content)
					: new Uint8Array(att.content);
			await env.MAIL_BUCKET.put(blobKey, content, {
				httpMetadata: {
					contentType: att.mimeType || "application/octet-stream",
				},
			});
			attachments.push({
				filename: att.filename || "attachment",
				contentType: att.mimeType || "application/octet-stream",
				sizeBytes: content.byteLength,
				contentId: att.contentId ?? null,
				isInline: att.disposition === "inline",
				blobKey,
			});
		}

		// Optionally store extracted bodies (keeps them out of the envelope POST).
		let bodyTextKey: string | null = null;
		let bodyHtmlKey: string | null = null;
		if (parsed.text) {
			bodyTextKey = `mail/body/${ownerSlug}/${uuid()}.txt`;
			await env.MAIL_BUCKET.put(bodyTextKey, parsed.text, {
				httpMetadata: { contentType: "text/plain" },
			});
		}
		if (parsed.html) {
			bodyHtmlKey = `mail/body/${ownerSlug}/${uuid()}.html`;
			await env.MAIL_BUCKET.put(bodyHtmlKey, parsed.html, {
				httpMetadata: { contentType: "text/html" },
			});
		}

		const snippet = (parsed.text ?? "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 200);

		const envelope: InboundEnvelope = {
			rcptTo,
			mailFrom: (parsed.from?.address ?? message.from).trim().toLowerCase(),
			fromName: parsed.from?.name ?? null,
			messageId: parsed.messageId ?? `<${uuid()}@${env.MAIL_DOMAIN}>`,
			inReplyTo: parsed.inReplyTo ?? null,
			references: parsed.references
				? parsed.references.split(/\s+/).filter(Boolean)
				: [],
			subject: parsed.subject ?? null,
			to: (parsed.to ?? [])
				.map((a) => a.address?.toLowerCase() ?? "")
				.filter(Boolean),
			cc: (parsed.cc ?? [])
				.map((a) => a.address?.toLowerCase() ?? "")
				.filter(Boolean),
			bcc: (parsed.bcc ?? [])
				.map((a) => a.address?.toLowerCase() ?? "")
				.filter(Boolean),
			replyTo: parsed.replyTo?.[0]?.address ?? null,
			rawSize: message.rawSize,
			rawBlobKey,
			bodyTextKey,
			bodyHtmlKey,
			snippet,
			auth: readAuth(message, env),
			attachments,
			hasCalendarInvite: (parsed.attachments ?? []).some(
				(a) => a.mimeType === "text/calendar",
			),
			receivedAt: Date.now(),
		};
		// The catch-all default-rejects unknown handles API-side (404); the Worker
		// always has at least one recipient (the routed address).
		if (envelope.to.length === 0) envelope.to.push(rcptTo);

		const body = JSON.stringify(envelope);
		const timestamp = String(Date.now());
		const nonce = uuid();
		const signature = await hmacSign(env.MAIL_INBOUND_SECRET, body);

		const res = await fetch(`${env.ROX_API_URL}/api/mail/inbound`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-rox-mail-signature": signature,
				"x-rox-mail-timestamp": timestamp,
				"x-rox-mail-nonce": nonce,
			},
			body,
		});

		// 404 = unknown handle: reject so the sender gets a bounce (no backscatter
		// into a non-existent mailbox). Everything else is accepted/kept API-side.
		if (res.status === 404) {
			message.setReject("No such recipient");
		}
	},
};
