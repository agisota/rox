/**
 * Resend delivery-event processing (D3 / M4).
 *
 * Maps a verified Resend webhook event onto a `mail_messages.status` transition
 * and persists it idempotently:
 *
 *   1. Insert a `mail_events` audit row, deduped on
 *      (`provider`, `provider_event_id`) — a duplicate delivery is a no-op.
 *   2. Resolve the target `mail_messages` row by the Resend `email_id`
 *      (= `provider_event_id` stamped at send time) and advance its status.
 *   3. On a complaint, bump the sending `mail_addresses.complaint_count`
 *      (reputation/suppression feedback the kill-switch reads).
 *
 * The DB work goes through a narrow {@link MailEventsDb} port so the
 * orchestration is unit-testable without a live database (house pattern).
 */

import type { MailStatus } from "@rox/db/enums";

/** Resend event types we act on; everything else is logged but ignored. */
export type ResendEventType =
	| "email.sent"
	| "email.delivered"
	| "email.delivery_delayed"
	| "email.bounced"
	| "email.complained"
	| "email.failed";

/** Map a Resend event type to the `mail_messages.status` it should set, if any. */
export function statusForEvent(eventType: string): MailStatus | null {
	switch (eventType) {
		case "email.delivered":
			return "delivered";
		case "email.bounced":
			return "bounced";
		case "email.complained":
			return "complained";
		case "email.failed":
			return "failed";
		// sent / delivery_delayed do not regress an already-advanced status.
		default:
			return null;
	}
}

/** Narrow persistence port for {@link processResendEvent}. */
export interface MailEventsDb {
	/**
	 * Record the raw event, deduped on (`provider`, `provider_event_id`). Returns
	 * `false` when the row already existed (duplicate delivery → skip the rest).
	 */
	recordEvent(args: {
		providerEventId: string;
		eventType: string;
		messageId: string | null;
		organizationId: string | null;
		payload: Record<string, unknown>;
	}): Promise<boolean>;
	/** Resolve the owned `mail_messages` row by Resend `email_id`. */
	findMessageByProviderId(emailId: string): Promise<{
		id: string;
		organizationId: string;
		addressId: string | null;
	} | null>;
	/** Advance a message's delivery status. */
	updateMessageStatus(messageId: string, status: MailStatus): Promise<void>;
	/** Bump the sending address's complaint counter (suppression feedback). */
	incrementComplaint(addressId: string): Promise<void>;
}

export interface ResendWebhookBody {
	type?: string;
	data?: { email_id?: string; [k: string]: unknown };
	[k: string]: unknown;
}

export type ProcessResult =
	| { kind: "duplicate" }
	| { kind: "ignored"; eventType: string }
	| { kind: "no_message"; eventType: string }
	| { kind: "applied"; eventType: string; status: MailStatus | null };

/**
 * Process one verified Resend webhook event. `svixId` is the dedup key.
 * Idempotent: a repeated delivery records nothing new and re-applies no status.
 */
export async function processResendEvent(
	db: MailEventsDb,
	svixId: string,
	body: ResendWebhookBody,
): Promise<ProcessResult> {
	const eventType = typeof body.type === "string" ? body.type : "";
	const emailId =
		typeof body.data?.email_id === "string" ? body.data.email_id : null;

	const message = emailId ? await db.findMessageByProviderId(emailId) : null;

	const fresh = await db.recordEvent({
		providerEventId: svixId,
		eventType,
		messageId: message?.id ?? null,
		organizationId: message?.organizationId ?? null,
		payload: body as Record<string, unknown>,
	});
	if (!fresh) return { kind: "duplicate" };

	const status = statusForEvent(eventType);
	if (status === null) return { kind: "ignored", eventType };

	if (!message) return { kind: "no_message", eventType };

	await db.updateMessageStatus(message.id, status);
	if (status === "complained" && message.addressId) {
		await db.incrementComplaint(message.addressId);
	}

	return { kind: "applied", eventType, status };
}
