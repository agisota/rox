import { z } from "zod";

/**
 * Zod inputs for the comms tRPC router (D1 Phase 5, T5.1).
 *
 * The unified inbox: org-scoped thread listing, a thread + its messages, an
 * in-app send (routed through the `@rox/comms-core` MessageRouter), and a
 * mark-read. Address values are the `username@rox.one` form derived from a rox
 * handle; recipients are referenced either by rox `userId` or by raw address.
 */

const attachmentSchema = z.object({
	name: z.string().min(1).max(512),
	url: z.string().url(),
	contentType: z.string().max(255),
	size: z.number().int().min(0),
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

export const recipientSchema = z.union([
	z.object({ kind: z.literal("userId"), userId: z.string().uuid() }),
	z.object({ kind: z.literal("address"), address: z.string().min(3).max(320) }),
]);

export const sendMessageSchema = z.object({
	/** Append to an existing thread, or omit to resolve/create one. */
	threadId: z.string().uuid().optional(),
	recipients: z.array(recipientSchema).min(1).max(50),
	subject: z.string().max(500).nullish(),
	body: z.string().min(1).max(50_000),
	bodyHtml: z.string().max(200_000).nullish(),
	attachments: z.array(attachmentSchema).max(20).optional(),
	/** Stable client id for in-app `(transport, external_id)` idempotency. */
	clientId: z.string().min(1).max(128).optional(),
});

export const markReadSchema = z.object({
	threadId: z.string().uuid(),
	/** The last message the caller has read (sets their participant watermark). */
	lastReadMessageId: z.string().uuid(),
});

/** Transports a client can heartbeat presence on (I4). */
export const presenceTransportSchema = z.enum([
	"inapp",
	"xmpp",
	"email",
	"mesh",
]);

/** Aggregate/per-transport presence states (I4). */
export const presenceStateSchema = z.enum(["online", "away", "dnd", "offline"]);

export const updatePresenceSchema = z.object({
	/** The transport the caller is heartbeating from (defaults to in-app). */
	transport: presenceTransportSchema.optional(),
	state: presenceStateSchema,
	statusText: z.string().max(140).nullish(),
});

export const getPresenceSchema = z.object({
	/** Whose presence to read (defaults to the caller). */
	userId: z.string().uuid().optional(),
});
