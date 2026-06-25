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
		/**
		 * Restrict to a single server-backed folder (FN-135 / #697). Omit for the
		 * whole mailbox. `sent`/`drafts` are NOT placements (derived from direction /
		 * the mail_drafts table), so they are not valid here.
		 */
		folder: z.enum(["inbox", "archive", "spam", "trash"]).optional(),
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

/**
 * One outbound attachment supplied on send (FN-141 / #701). The client first
 * uploads the file bytes to R2 via the presigned PUT from
 * `mail.presignAttachmentUpload`, then sends back the returned `key` + metadata;
 * `mail.send` persists a `mail_attachments` row and includes the file in the
 * Resend payload. `key` MUST be the exact key the presign minted (the send path
 * re-validates the `mail/outbound/<userId>/...` owner prefix before trusting it).
 */
export const sendAttachmentSchema = z.object({
	/** The R2 object key returned by `mail.presignAttachmentUpload`. */
	key: z.string().min(1).max(1024),
	/** Original filename shown to the recipient. */
	filename: z.string().min(1).max(255),
	/** MIME type the file was uploaded with. */
	contentType: z.string().min(1).max(255),
	/** Size in bytes (re-checked against the per-send cap). */
	sizeBytes: z
		.number()
		.int()
		.min(0)
		.max(25 * 1024 * 1024),
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
	/** Outbound attachments (pre-uploaded to R2; FN-141 / #701). */
	attachments: z.array(sendAttachmentSchema).max(20).optional(),
});

/** Move a thread into a server-backed folder (FN-135 / #697). */
export const setFolderSchema = z.object({
	threadId: z.string().uuid(),
	folder: z.enum(["inbox", "archive", "spam", "trash"]),
});

/** Toggle (or set) the ⭐ flag on a thread (FN-135 / #697). */
export const setFlagSchema = z.object({
	threadId: z.string().uuid(),
	/** Explicit flag value; omit to toggle the current value. */
	flagged: z.boolean().optional(),
});

/** Full-text search the caller's mailbox (FN-138 / #698). */
export const searchSchema = z.object({
	/** The raw query string (websearch syntax allowed; lenient). */
	query: z.string().min(1).max(256),
	/** Max threads to return (ranked, newest-first within rank). */
	limit: z.number().int().min(1).max(50).optional(),
});

/** Insert-or-update a server-backed compose draft (FN-139 / #699). */
export const saveDraftSchema = z.object({
	/** Existing draft id to update; omit to create a new draft. */
	id: z.string().uuid().nullish(),
	/** Reply context thread, if this draft replies within a thread. */
	threadId: z.string().uuid().nullish(),
	/** Raw recipient strings as typed in the composer (parsed at send). */
	to: z.string().max(2000).optional(),
	cc: z.string().max(2000).optional(),
	bcc: z.string().max(2000).optional(),
	subject: z.string().max(500).optional(),
	body: z.string().max(500_000).optional(),
	/** Staged attachment metadata remembered on the draft. */
	attachments: z
		.array(
			z.object({
				filename: z.string().min(1).max(255),
				sizeBytes: z.number().int().min(0),
				contentType: z.string().max(255).optional(),
				blobKey: z.string().max(1024).optional(),
			}),
		)
		.max(20)
		.optional(),
});

/** Delete a server-backed draft the caller owns (FN-139 / #699). */
export const deleteDraftSchema = z.object({
	id: z.string().uuid(),
});

/**
 * Mint a presigned R2 PUT for one outbound attachment (FN-141 / #701). The
 * client uploads the bytes directly to R2, then passes the returned key back on
 * `mail.send`. The key is server-derived from the owner id + a content hash so a
 * client can never target another user's prefix.
 */
export const presignAttachmentUploadSchema = z.object({
	filename: z.string().min(1).max(255),
	contentType: z.string().min(1).max(255),
	sizeBytes: z
		.number()
		.int()
		.min(1)
		.max(25 * 1024 * 1024),
	/** Hex sha256 of the file bytes — used to build a content-addressed key. */
	sha256: z
		.string()
		.regex(/^[a-f0-9]{64}$/i, "sha256 must be a 64-char hex digest"),
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
