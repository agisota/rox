/**
 * Calendar reminder dispatch — server-only due-scan (C6).
 *
 * Mirrors {@link runAmbientNudges}: a QStash schedule on a `*\/5 * * * *`
 * cadence hits the route that calls {@link runDueReminders}. Each tick selects
 * `cal_reminders` rows that are `status='scheduled' AND next_fire_at <= now()`
 * (capped at {@link MAX_REMINDERS_PER_TICK}, ordered by `next_fire_at` so the
 * oldest-due fire first), joins their `cal_events`, and delivers per channel:
 *
 *   - `in_app`  → INSERT a `journal_events` row (`kind='calendar_reminder'`,
 *     `created_by = owner_user_id`). This is the EXISTING in-app feed that
 *     Electric replicates to web + desktop, so no new notification table or UI
 *     is needed.
 *   - `email`   → the gated Resend seam (`getMailSendFn`); a clean no-op
 *     (counted as `skipped`) when the seam is inert (CI/dev without
 *     `MAIL_OUTBOUND_ENABLED` + `RESEND_API_KEY`).
 *
 * After delivery a recurring relative reminder re-advances `next_fire_at` and
 * stays `scheduled`; a one-off (or absolute) flips to `fired` with
 * `last_fired_at`. This makes a re-tick idempotent: the row either advanced past
 * `now()` or is no longer `scheduled`, so a duplicate run is a no-op. Cancelled
 * events are skipped (their reminders flip to `cancelled`). Partial failures are
 * isolated with `Promise.allSettled` + `logger.error`, mirroring the
 * drive/accrue-overage fan-out.
 */

import { db, dbWs } from "@rox/db/client";
import { calEvents, calReminders, journalEvents, users } from "@rox/db/schema";
import { advanceAfterFire } from "@rox/trpc/calendar-reminders";
import { getMailDomain, getMailSendFn } from "@rox/trpc/mail-transport";
import { and, asc, eq, lte } from "drizzle-orm";
import { logger } from "@/lib/logger";

/** Discriminator for the reminder rows written into the journal event lane. */
export const CALENDAR_REMINDER_KIND = "calendar_reminder";

/** Upper bound on reminders processed per tick (scan + delivery guard). */
export const MAX_REMINDERS_PER_TICK = 100;

export interface RunDueRemindersResult {
	/** Due rows inspected this tick. */
	considered: number;
	/** Reminders that delivered and flipped to `fired` (one-off / absolute). */
	fired: number;
	/** Recurring relative reminders that delivered and re-armed `next_fire_at`. */
	advanced: number;
	/** Reminders skipped (cancelled event, or email seam inert). */
	skipped: number;
	/** Reminders whose delivery threw (logged, left for the next tick / failed). */
	failed: number;
}

/** A due reminder joined to the slice of its event the dispatch needs. */
interface DueReminderRow {
	reminder: typeof calReminders.$inferSelect;
	event: typeof calEvents.$inferSelect;
}

/** Select scheduled reminders whose fire instant has arrived, joined to events. */
async function findDueReminders(now: Date): Promise<DueReminderRow[]> {
	return db
		.select({ reminder: calReminders, event: calEvents })
		.from(calReminders)
		.innerJoin(calEvents, eq(calReminders.eventId, calEvents.id))
		.where(
			and(
				eq(calReminders.status, "scheduled"),
				lte(calReminders.nextFireAt, now),
			),
		)
		.orderBy(asc(calReminders.nextFireAt))
		.limit(MAX_REMINDERS_PER_TICK);
}

/** Write one reminder into the in-app journal feed (kind='calendar_reminder'). */
async function deliverInApp(row: DueReminderRow): Promise<void> {
	const { reminder, event } = row;
	await dbWs.insert(journalEvents).values({
		organizationId: reminder.organizationId,
		createdBy: reminder.ownerUserId,
		automationId: null,
		automationRunId: null,
		kind: CALENDAR_REMINDER_KIND,
		title: event.title,
		summary: event.location
			? `Напоминание о событии · ${event.location}`
			: "Напоминание о событии",
		payload: {
			eventId: event.id,
			calendarId: event.calendarId,
			occurrenceStart: event.dtstart.toISOString(),
			reminderId: reminder.id,
			channel: reminder.channel,
		},
	});
}

/**
 * Deliver a reminder over email through the gated Resend seam. Returns `false`
 * (a clean skip) when the seam is inert or the recipient has no address; returns
 * `true` once the send is dispatched. Never throws on the inert path.
 */
async function deliverEmail(row: DueReminderRow): Promise<boolean> {
	const sendFn = getMailSendFn();
	if (!sendFn) return false; // outbound not configured → counted as skipped.

	const { reminder, event } = row;
	const [recipient] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, reminder.ownerUserId))
		.limit(1);
	if (!recipient?.email) return false;

	await sendFn({
		from: `Rox Calendar <reminders@${getMailDomain()}>`,
		to: [recipient.email],
		subject: `Напоминание: ${event.title}`,
		text: [
			`Напоминание о событии «${event.title}».`,
			`Начало: ${event.dtstart.toISOString()}.`,
			event.location ? `Место: ${event.location}.` : null,
		]
			.filter(Boolean)
			.join("\n"),
	});
	return true;
}

/**
 * Re-arm or close a reminder after a successful delivery. A recurring relative
 * reminder advances `next_fire_at` to the next occurrence and stays
 * `scheduled`; otherwise (one-off relative, absolute, or an exhausted
 * recurrence) it flips to `fired`. Returns whether it advanced (vs fired).
 */
async function settleAfterFire(
	row: DueReminderRow,
	now: Date,
): Promise<"advanced" | "fired"> {
	const { reminder, event } = row;
	const nextFireAt =
		reminder.triggerKind === "relative"
			? advanceAfterFire({
					event: {
						dtstart: event.dtstart,
						rrule: event.rrule,
						timezone: event.timezone,
					},
					offsetMinutes: reminder.offsetMinutes,
					firedFor: reminder.nextFireAt,
					now,
				})
			: null;

	if (nextFireAt) {
		await dbWs
			.update(calReminders)
			.set({ nextFireAt, lastFiredAt: now, status: "scheduled" })
			.where(eq(calReminders.id, reminder.id));
		return "advanced";
	}

	await dbWs
		.update(calReminders)
		.set({ lastFiredAt: now, status: "fired" })
		.where(eq(calReminders.id, reminder.id));
	return "fired";
}

/** Close a reminder whose event was cancelled (never deliver for it). */
async function cancelForCancelledEvent(row: DueReminderRow): Promise<void> {
	await dbWs
		.update(calReminders)
		.set({ status: "cancelled" })
		.where(eq(calReminders.id, row.reminder.id));
}

/** Outcome of processing a single due reminder. */
type DeliveryOutcome = "fired" | "advanced" | "skipped";

/** Deliver + settle one due reminder; returns its outcome bucket. */
async function processReminder(
	row: DueReminderRow,
	now: Date,
): Promise<DeliveryOutcome> {
	// Never fire for a cancelled event (mirrors listOccurrences filtering).
	if (row.event.status === "cancelled") {
		await cancelForCancelledEvent(row);
		return "skipped";
	}

	if (row.reminder.channel === "email") {
		const sent = await deliverEmail(row);
		if (!sent) return "skipped"; // seam inert / no recipient address.
	} else {
		await deliverInApp(row);
	}

	return settleAfterFire(row, now);
}

/**
 * One due-scan pass: deliver every reminder whose fire instant has arrived.
 * Safe to call on a `*\/5 * * * *` schedule — bounded by
 * {@link MAX_REMINDERS_PER_TICK} and idempotent (a re-tick on already-advanced /
 * fired rows is a no-op).
 */
export async function runDueReminders(
	now: Date = new Date(),
): Promise<RunDueRemindersResult> {
	const due = await findDueReminders(now);

	const results = await Promise.allSettled(
		due.map((row) => processReminder(row, now)),
	);

	let fired = 0;
	let advanced = 0;
	let skipped = 0;
	const failures: unknown[] = [];
	for (const r of results) {
		if (r.status === "rejected") {
			failures.push(r.reason);
			continue;
		}
		if (r.value === "fired") fired += 1;
		else if (r.value === "advanced") advanced += 1;
		else skipped += 1;
	}

	if (failures.length > 0) {
		logger.error("[calendar/reminders] Some reminders failed to dispatch", {
			considered: due.length,
			fired,
			advanced,
			skipped,
			failed: failures.length,
			errors: failures.map((e) => String(e).slice(0, 500)),
		});
	}

	return {
		considered: due.length,
		fired,
		advanced,
		skipped,
		failed: failures.length,
	};
}
