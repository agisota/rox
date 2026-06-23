/**
 * Drizzle-backed {@link MailEventsDb} — the real persistence wiring for the
 * Resend delivery webhook (D3 / M4). The pure {@link processResendEvent}
 * orchestration never imports a db client; this is where its narrow port becomes
 * Drizzle statements against `mail_events`, `mail_messages`, `mail_addresses`.
 */

import { db } from "@rox/db/client";
import { mailAddresses, mailEvents, mailMessages } from "@rox/db/schema";
import { eq, sql } from "drizzle-orm";
import type { MailEventsDb } from "./events";

/** Build the production {@link MailEventsDb} bound to the live Drizzle client. */
export function createMailEventsDb(): MailEventsDb {
	return {
		async recordEvent(args) {
			// Dedup on (provider, provider_event_id): a duplicate delivery inserts
			// nothing and returns no row → caller skips re-applying the status.
			const inserted = await db
				.insert(mailEvents)
				.values({
					provider: "resend",
					eventType: args.eventType,
					providerEventId: args.providerEventId,
					messageId: args.messageId,
					organizationId: args.organizationId,
					payload: args.payload,
				})
				.onConflictDoNothing({
					target: [mailEvents.provider, mailEvents.providerEventId],
				})
				.returning({ id: mailEvents.id });
			return inserted.length > 0;
		},

		async findMessageByProviderId(emailId) {
			const [row] = await db
				.select({
					id: mailMessages.id,
					organizationId: mailMessages.organizationId,
					addressId: mailMessages.addressId,
				})
				.from(mailMessages)
				.where(eq(mailMessages.providerEventId, emailId))
				.limit(1);
			return row ?? null;
		},

		async updateMessageStatus(messageId, status) {
			await db
				.update(mailMessages)
				.set({ status })
				.where(eq(mailMessages.id, messageId));
		},

		async incrementComplaint(addressId) {
			await db
				.update(mailAddresses)
				.set({
					complaintCount: sql`${mailAddresses.complaintCount} + 1`,
				})
				.where(eq(mailAddresses.id, addressId));
		},
	};
}
