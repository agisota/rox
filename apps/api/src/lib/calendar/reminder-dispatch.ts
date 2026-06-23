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
 * Each due row is CLAIMED before any delivery (claim-first / settle-before-
 * deliver): a conditional UPDATE guarded by the exact state the tick observed
 * (`id=? AND status='scheduled' AND next_fire_at=<observed>`) advances a
 * recurring relative reminder's `next_fire_at` (staying `scheduled`), or flips a
 * one-off/absolute/exhausted reminder to `fired` with `last_fired_at`. The claim
 * `RETURNING`s the row only if it won the race, so exactly ONE overlapping tick
 * proceeds to deliver — the others see 0 rows and skip. This makes concurrent /
 * retried ticks idempotent (no duplicate `journal_events` row, no duplicate
 * email): the race is removed entirely, not absorbed by a unique constraint.
 * Delivery is therefore at-most-once — a rare post-claim delivery throw is
 * logged (and the in_app row flipped to `failed`), never re-delivered. Cancelled
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
 * Atomically CLAIM a due reminder BEFORE any delivery (settle-before-deliver).
 * The UPDATE is guarded by the exact state the tick observed
 * (`status='scheduled' AND next_fire_at=<observed>`), so under overlapping /
 * retried ticks exactly one claim wins: a recurring relative reminder advances
 * `next_fire_at` to its next occurrence (staying `scheduled`); a one-off /
 * absolute / exhausted reminder flips to `fired`. Both carry `last_fired_at`.
 *
 * Returns the claim outcome — `"advanced"` / `"fired"` when this tick won the
 * row (1 row updated → safe to deliver), or `null` when another tick already
 * claimed it (0 rows → skip delivery entirely, no duplicate).
 */
async function claimReminder(
	row: DueReminderRow,
	now: Date,
): Promise<"advanced" | "fired" | null> {
	const { reminder, event } = row;
	// The instant this tick observed; the claim only wins if it is unchanged.
	const observed = reminder.nextFireAt;
	const nextFireAt =
		reminder.triggerKind === "relative"
			? advanceAfterFire({
					event: {
						dtstart: event.dtstart,
						rrule: event.rrule,
						timezone: event.timezone,
					},
					offsetMinutes: reminder.offsetMinutes,
					firedFor: observed,
					now,
				})
			: null;

	// Recurring with a next occurrence → advance + stay scheduled; otherwise
	// (one-off / absolute / exhausted recurrence) → flip to fired.
	const claimSet = nextFireAt
		? { nextFireAt, lastFiredAt: now, status: "scheduled" as const }
		: { lastFiredAt: now, status: "fired" as const };

	const claimed = await dbWs
		.update(calReminders)
		.set(claimSet)
		.where(
			and(
				eq(calReminders.id, reminder.id),
				eq(calReminders.status, "scheduled"),
				eq(calReminders.nextFireAt, observed),
			),
		)
		.returning({ id: calReminders.id });

	// 0 rows ⇒ another overlapping tick already claimed this exact instant.
	if (claimed.length === 0) return null;
	return nextFireAt ? "advanced" : "fired";
}

/**
 * Mark a reminder `failed` after its in_app delivery threw post-claim. The claim
 * already consumed the fire instant (at-most-once), so this only makes the
 * failure observable — it never re-delivers. Best-effort: a throw here is
 * swallowed so it can't mask the original delivery error.
 */
async function markFailed(reminderId: string): Promise<void> {
	try {
		await dbWs
			.update(calReminders)
			.set({ status: "failed" })
			.where(eq(calReminders.id, reminderId));
	} catch {
		// Observability-only flip; ignore so the delivery error stays primary.
	}
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

/** Claim (settle) one due reminder, then deliver only if the claim won. */
async function processReminder(
	row: DueReminderRow,
	now: Date,
): Promise<DeliveryOutcome> {
	// Never fire for a cancelled event (mirrors listOccurrences filtering).
	if (row.event.status === "cancelled") {
		await cancelForCancelledEvent(row);
		return "skipped";
	}

	// Email seam inert / no recipient ⇒ a clean skip that must NOT consume the
	// fire instant, so probe it before claiming (claiming would flip the row and
	// silently swallow the reminder while outbound is disabled).
	if (row.reminder.channel === "email") {
		const sendFn = getMailSendFn();
		if (!sendFn) return "skipped";
	}

	// CLAIM FIRST: atomically settle under the observed state. 0 rows ⇒ another
	// overlapping tick already owns this instant ⇒ skip with no delivery.
	const claim = await claimReminder(row, now);
	if (claim === null) return "skipped";

	// We won the claim — deliver exactly once. A post-claim delivery throw is
	// logged by the caller's allSettled (at-most-once: never re-delivered).
	if (row.reminder.channel === "email") {
		const sent = await deliverEmail(row);
		// Recipient vanished between probe and claim: nothing to send, but the
		// instant is already consumed (fired/advanced) — do not re-deliver.
		if (!sent) return claim;
	} else {
		try {
			await deliverInApp(row);
		} catch (err) {
			// Claim already consumed the instant; flag the row failed for
			// observability and rethrow so the tick logs it (no retry).
			await markFailed(row.reminder.id);
			throw err;
		}
	}

	return claim;
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
