/**
 * `InAppAdapter` — the reference {@link TransportAdapter} implementation.
 *
 * In-app messages never leave Rox: there is no external provider. Inbound
 * normalization is the identity-ish pass over an already-structured client
 * payload, and `send` is a no-op delivery confirmation (the actual persistence
 * + Electric live-sync is the router's job via injected ports). It exists so the
 * `inapp` transport satisfies the same contract every other transport does,
 * giving the router uniform threading/idempotency.
 */

import type {
	CommsAttachment,
	CommsMessageMetadata,
	NormalizedMessage,
	OutboundDraft,
} from "../types";
import type {
	SendContext,
	SendResult,
	TransportAdapter,
} from "./TransportAdapter";

/** The client-side shape an in-app message arrives in. */
export interface InAppRawMessage {
	/** Client-generated id — stable for `(inapp, external_id)` idempotency. */
	clientId: string;
	/** Sender's in-app address (the rox handle@rox.one or user id). */
	from: string;
	/** Recipient in-app addresses. */
	to: string[];
	body: string;
	/** Optional reply target (another in-app clientId). */
	inReplyTo?: string | null;
	attachments?: CommsAttachment[];
	/** Client send time (ms epoch or ISO); defaults to now if absent. */
	sentAt?: number | string;
	metadata?: CommsMessageMetadata;
}

function toDate(value: number | string | undefined): Date {
	if (value === undefined) return new Date();
	const d = typeof value === "number" ? new Date(value) : new Date(value);
	return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class InAppAdapter implements TransportAdapter<InAppRawMessage> {
	readonly kind = "inapp" as const;

	normalizeInbound(raw: InAppRawMessage): NormalizedMessage {
		return {
			transport: "inapp",
			externalId: raw.clientId,
			inReplyToExternalId: raw.inReplyTo ?? null,
			from: raw.from.trim().toLowerCase(),
			to: raw.to.map((t) => t.trim().toLowerCase()),
			subject: null,
			body: raw.body,
			bodyHtml: null,
			attachments: raw.attachments ?? [],
			createdAt: toDate(raw.sentAt),
			metadata: raw.metadata ?? {},
		};
	}

	/**
	 * In-app "delivery" is local: there is no remote provider to accept the
	 * message, so we synthesize a deterministic provider id from the message +
	 * delivery so callers still get a stable handle.
	 */
	async send(_draft: OutboundDraft, ctx: SendContext): Promise<SendResult> {
		return { providerId: `inapp:${ctx.delivery.messageId}:${ctx.delivery.id}` };
	}
}
