/**
 * Mail outbound transport seam (D3 P3) — guarded Resend construction.
 *
 * D3 outbound is sent through Resend. The path is GATED so it stays inert
 * without real keys (mirrors how collab/rtc + Drive's R2 are gated): outbound is
 * only live when `MAIL_OUTBOUND_ENABLED="true"` AND a `RESEND_API_KEY` is
 * present. Otherwise {@link getMailSendFn} returns `null` and the router surfaces
 * a clean `PRECONDITION_FAILED` instead of attempting a live send.
 *
 * Construction is lazy + memoized and NEVER throws at import time, so the
 * package compiles + unit-tests without secrets. Tests inject a fake send fn via
 * {@link setMailSendFnForTest} — no real email is ever sent in tests.
 */

import type { EmailOutboundPayload, ResendSendFn } from "@rox/comms-core";
import { Resend } from "resend";

/** Sending domain for `<handle>@rox.one`; overridable via `MAIL_DOMAIN`. */
export const DEFAULT_MAIL_DOMAIN = "rox.one";

interface MailEnv {
	MAIL_OUTBOUND_ENABLED?: string;
	RESEND_API_KEY?: string;
	MAIL_DOMAIN?: string;
}

function readEnv(): MailEnv {
	const env = (globalThis as { process?: { env?: Record<string, string> } })
		.process?.env;
	return {
		MAIL_OUTBOUND_ENABLED: env?.MAIL_OUTBOUND_ENABLED,
		RESEND_API_KEY: env?.RESEND_API_KEY,
		MAIL_DOMAIN: env?.MAIL_DOMAIN,
	};
}

/** The sending domain from env (or the default). */
export function getMailDomain(env: MailEnv = readEnv()): string {
	return env.MAIL_DOMAIN?.trim() || DEFAULT_MAIL_DOMAIN;
}

/** True only when outbound is explicitly enabled AND a Resend key is present. */
export function isMailOutboundEnabled(env: MailEnv = readEnv()): boolean {
	return env.MAIL_OUTBOUND_ENABLED === "true" && Boolean(env.RESEND_API_KEY);
}

let cached: ResendSendFn | null | undefined;
let testOverride: ResendSendFn | null | undefined;

/**
 * Inject a fake send fn for unit tests. Pass `null` to simulate an env with no
 * outbound configured; pass `undefined` to clear the override.
 */
export function setMailSendFnForTest(
	fn: ResendSendFn | null | undefined,
): void {
	testOverride = fn;
	cached = undefined;
}

/** Wrap `resend.emails.send` as the adapter's {@link ResendSendFn}. */
function resendSendFn(apiKey: string): ResendSendFn {
	const resend = new Resend(apiKey);
	return async (payload: EmailOutboundPayload) => {
		const { data, error } = await resend.emails.send({
			from: payload.from,
			to: payload.to,
			...(payload.cc ? { cc: payload.cc } : {}),
			...(payload.bcc ? { bcc: payload.bcc } : {}),
			...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
			subject: payload.subject,
			text: payload.text,
			...(payload.html ? { html: payload.html } : {}),
			...(payload.headers ? { headers: payload.headers } : {}),
			// FN-141 (#701): outbound attachments delivered to Resend by remote URL
			// (a presigned R2 GET) so bytes are never inlined into this request.
			...(payload.attachments
				? {
						attachments: payload.attachments.map((a) => ({
							filename: a.filename,
							...(a.path ? { path: a.path } : {}),
							...(a.content ? { content: a.content } : {}),
							...(a.contentType ? { contentType: a.contentType } : {}),
						})),
					}
				: {}),
		});
		if (error) {
			throw new Error(`Resend send failed: ${error.message}`);
		}
		return { id: data?.id ?? "" };
	};
}

/**
 * Resolve the outbound send fn, or `null` when outbound is not configured
 * (CI/dev/no key). Lazy + memoized; a thrown construction error degrades to
 * `null` rather than crashing the router.
 */
export function getMailSendFn(): ResendSendFn | null {
	if (testOverride !== undefined) return testOverride;
	if (cached !== undefined) return cached;

	const env = readEnv();
	if (!isMailOutboundEnabled(env) || !env.RESEND_API_KEY) {
		cached = null;
		return cached;
	}
	try {
		cached = resendSendFn(env.RESEND_API_KEY);
	} catch {
		cached = null;
	}
	return cached;
}
