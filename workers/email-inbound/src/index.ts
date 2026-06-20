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
	auth: { spf: boolean; dkim: boolean; dmarc: boolean };
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

/** Read the SPF/DKIM/DMARC verdicts Cloudflare attaches to the message. */
function readAuth(message: ForwardableEmailMessage): InboundEnvelope["auth"] {
	const get = (name: string): boolean => {
		const value = message.headers.get(name)?.toLowerCase() ?? "";
		// `Authentication-Results` style or per-result headers: treat an explicit
		// "pass" as pass, everything else (fail/none/absent) as not-pass.
		return value.includes("pass");
	};
	const authResults =
		message.headers.get("authentication-results")?.toLowerCase() ?? "";
	return {
		spf: authResults.includes("spf=pass") || get("received-spf"),
		dkim: authResults.includes("dkim=pass"),
		dmarc: authResults.includes("dmarc=pass"),
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
			auth: readAuth(message),
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
