import { z } from "zod";

/**
 * Zod inputs for the mail tRPC router (D3 P3).
 *
 * The per-user `<handle>@rox.one` mailbox: provision the routable address,
 * list/read threads + messages (org + owner scoped), send (compose/reply via
 * Resend, quota-gated), and mark-read. Bodies/attachments live in R2; these
 * inputs carry only metadata + pointers.
 */

export const provisionAddressSchema = z.object({
	/** The rox handle to derive `<handle>@rox.one` from (defaults to the
	 *  caller's profile handle when omitted). */
	handle: z.string().min(1).max(64).optional(),
});

export const listThreadsSchema = z
	.object({
		/** Inbox page size (newest-first by `last_message_at`). */
		limit: z.number().int().min(1).max(100).optional(),
	})
	.optional();

export const getThreadSchema = z.object({
	threadId: z.string().uuid(),
	/** Cap on messages returned for the thread (chronological). */
	limit: z.number().int().min(1).max(500).optional(),
});

export const getMessageSchema = z.object({
	messageId: z.string().uuid(),
});

export const sendSchema = z.object({
	/** Append to (reply within) an existing thread, or omit to start a new one. */
	threadId: z.string().uuid().nullish(),
	/** Recipient email addresses. */
	to: z.array(z.string().email()).min(1).max(50),
	cc: z.array(z.string().email()).max(50).optional(),
	bcc: z.array(z.string().email()).max(50).optional(),
	subject: z.string().max(500).optional(),
	/** Plaintext body. */
	body: z.string().min(1).max(500_000),
	/** Optional sanitized HTML body. */
	bodyHtml: z.string().max(2_000_000).optional(),
	/** RFC Message-ID this is a reply to (sets In-Reply-To/References). */
	inReplyTo: z.string().max(998).nullish(),
	references: z.array(z.string().max(998)).max(100).optional(),
});

export const markReadSchema = z.object({
	messageId: z.string().uuid(),
	isRead: z.boolean().optional(),
});

/** Resolve a short-TTL presigned R2 URL for one attachment the caller owns. */
export const getAttachmentUrlSchema = z.object({
	attachmentId: z.string().uuid(),
});

/** Resolve a short-TTL presigned R2 URL for a message body (text or html). */
export const getBodyUrlSchema = z.object({
	messageId: z.string().uuid(),
	/** Which stored body variant to fetch (default plaintext). */
	variant: z.enum(["text", "html"]).optional(),
});
