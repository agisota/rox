/**
 * Inbound envelope validation (D3 §"Worker contract").
 *
 * Validates the compact JSON the Cloudflare Email Worker POSTs and narrows it to
 * the {@link EmailRawInbound} shape the ingest consumes. Zod gives us a clean,
 * loud 400 for a malformed body instead of a downstream crash.
 */

import type { EmailAuthVerdict, EmailRawInbound } from "@rox/comms-core";
import { z } from "zod";

/**
 * A per-check verdict on the wire: the tri-state `pass`/`fail`/`unknown`, or a
 * back-compat boolean (`true`→pass, `false`→fail). Normalized to the verdict.
 */
const authVerdictSchema = z
	.union([z.enum(["pass", "fail", "unknown"]), z.boolean()])
	.transform((v): EmailAuthVerdict => {
		if (v === true) return "pass";
		if (v === false) return "fail";
		return v;
	});

const attachmentSchema = z.object({
	filename: z.string().min(1).max(998),
	contentType: z.string().max(255),
	sizeBytes: z.number().int().min(0),
	contentId: z.string().max(998).nullish(),
	isInline: z.boolean().optional(),
	blobKey: z.string().min(1).max(1024),
});

export const inboundEnvelopeSchema = z.object({
	rcptTo: z.string().min(3).max(320),
	mailFrom: z.string().min(3).max(320),
	fromName: z.string().max(998).nullish(),
	messageId: z.string().min(1).max(998),
	inReplyTo: z.string().max(998).nullish(),
	references: z.array(z.string().max(998)).max(100).optional(),
	subject: z.string().max(2000).nullish(),
	to: z.array(z.string().min(3).max(320)).min(1).max(100),
	cc: z.array(z.string().min(3).max(320)).max(100).optional(),
	bcc: z.array(z.string().min(3).max(320)).max(100).optional(),
	replyTo: z.string().max(320).nullish(),
	rawSize: z.number().int().min(0),
	rawBlobKey: z.string().min(1).max(1024),
	bodyTextKey: z.string().max(1024).nullish(),
	bodyHtmlKey: z.string().max(1024).nullish(),
	snippet: z.string().max(2000).nullish(),
	// SECURITY (PR #335 review): the Worker reports tri-state verdicts + a
	// `trusted` flag (set only when an allowlisted Authentication-Results
	// authserv-id stamped them). Booleans are accepted for back-compat and
	// normalized to verdicts; a missing `trusted` defaults to false (fail-closed).
	auth: z.object({
		spf: authVerdictSchema,
		dkim: authVerdictSchema,
		dmarc: authVerdictSchema,
		trusted: z.boolean().optional().default(false),
	}),
	attachments: z.array(attachmentSchema).max(100).optional(),
	hasCalendarInvite: z.boolean().optional(),
	receivedAt: z.union([z.number(), z.string()]).optional(),
});

export type ParseResult =
	| { ok: true; envelope: EmailRawInbound }
	| { ok: false; error: string };

/** Validate + narrow a raw JSON body into the ingest envelope. */
export function parseInboundEnvelope(json: unknown): ParseResult {
	const result = inboundEnvelopeSchema.safeParse(json);
	if (!result.success) {
		return { ok: false, error: result.error.issues[0]?.message ?? "invalid" };
	}
	return { ok: true, envelope: result.data as EmailRawInbound };
}
