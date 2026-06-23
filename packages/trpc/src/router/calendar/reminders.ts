/**
 * Pure fire-instant math for C6 calendar reminders (db-free, unit-tested).
 *
 * Keeps all RRULE/DST reasoning out of the router and the scheduler route so
 * both consume a single `next_fire_at` Date (mirrors the ambient-nudge pure
 * split). A reminder is either:
 *   - `relative`: fires `offsetMinutes` BEFORE an occurrence start. For a
 *     one-off event that is `dtstart - offset`; for a recurring event it is the
 *     first occurrence whose fire instant is still in the future, walked via the
 *     shared DST-correct {@link nextOccurrenceAfter}.
 *   - `absolute`: fires at a fixed instant, only if that instant is future.
 *
 * Every function returns `null` when there is no future fire (exhausted
 * recurrence, past one-off, or past absolute), which the scheduler reads as
 * "nothing more to fire".
 */

import { nextOccurrenceAfter } from "@rox/shared/rrule";

/** The recurrence-relevant slice of a calendar event. */
export interface ReminderEvent {
	dtstart: Date;
	rrule: string | null;
	timezone: string;
}

const MIN_MS = 60_000;

/** Bound the occurrence walk so a pathological rule can't spin forever. */
const MAX_OCCURRENCE_STEPS = 1000;

function subtractOffset(occurrence: Date, offsetMinutes: number): Date {
	return new Date(occurrence.getTime() - offsetMinutes * MIN_MS);
}

/**
 * The next fire instant for a recurring relative reminder: the first occurrence
 * strictly after `cursorStart` whose `(occurrence - offset)` is still in the
 * future relative to `now`. Because the offset shifts the fire earlier than the
 * occurrence, a near-future occurrence can already have an elapsed fire instant,
 * so we keep advancing the cursor until the fire is future (or the recurrence is
 * exhausted → null). `cursorStart` lets the post-fire advance skip past the
 * occurrence it just fired for; `now` is always the authoritative future-check.
 */
function nextRecurringFire(
	event: ReminderEvent & { rrule: string },
	offsetMinutes: number,
	cursorStart: Date,
	now: Date,
): Date | null {
	let cursor = cursorStart;
	for (let i = 0; i < MAX_OCCURRENCE_STEPS; i += 1) {
		const occurrence = nextOccurrenceAfter({
			rrule: event.rrule,
			dtstart: event.dtstart,
			timezone: event.timezone,
			after: cursor,
		});
		if (!occurrence) return null;
		const fire = subtractOffset(occurrence, offsetMinutes);
		if (fire.getTime() > now.getTime()) return fire;
		// This occurrence's fire instant already elapsed; look past it.
		cursor = occurrence;
	}
	return null;
}

/**
 * Compute the next un-fired instant for a reminder, or `null` when none remains.
 * This is the value persisted as `cal_reminders.next_fire_at` and the only key
 * the due-scan reads.
 */
export function computeNextFireAt(args: {
	event: ReminderEvent;
	offsetMinutes: number | null;
	absoluteFireAt: Date | null;
	now: Date;
}): Date | null {
	const { event, offsetMinutes, absoluteFireAt, now } = args;

	// Absolute: a fixed instant, fired once, only if still in the future.
	if (absoluteFireAt !== null) {
		return absoluteFireAt.getTime() > now.getTime() ? absoluteFireAt : null;
	}

	if (offsetMinutes === null) return null;

	// Relative one-off: the single fire is dtstart - offset.
	if (!event.rrule) {
		const fire = subtractOffset(event.dtstart, offsetMinutes);
		return fire.getTime() > now.getTime() ? fire : null;
	}

	// Relative recurring: the next occurrence whose fire instant is future.
	return nextRecurringFire(
		{ ...event, rrule: event.rrule },
		offsetMinutes,
		now,
		now,
	);
}

/**
 * Recompute `next_fire_at` for a recurring relative reminder after it fires for
 * `firedFor`. Returns the following occurrence's fire instant, or `null` when
 * the recurrence is exhausted or the reminder is one-off (no further fires).
 */
export function advanceAfterFire(args: {
	event: ReminderEvent;
	offsetMinutes: number | null;
	firedFor: Date;
	now: Date;
}): Date | null {
	const { event, offsetMinutes, firedFor, now } = args;
	// Only recurring relative reminders re-arm; one-off/absolute do not.
	if (offsetMinutes === null || !event.rrule) return null;
	// Search strictly after the occurrence we just fired for so we don't re-emit
	// the same instant; `firedFor` is `occurrence - offset`, so add the offset
	// back to get just-fired occurrence as the search floor.
	const justFiredOccurrence = new Date(
		firedFor.getTime() + offsetMinutes * MIN_MS,
	);
	return nextRecurringFire(
		{ ...event, rrule: event.rrule },
		offsetMinutes,
		justFiredOccurrence,
		now,
	);
}
