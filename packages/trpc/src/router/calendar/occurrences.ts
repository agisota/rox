/**
 * Calendar occurrence expansion (D6, P2).
 *
 * The calendar never persists materialized recurrence instances — it expands an
 * event into the requested `[rangeStart, rangeEnd)` window on read, reusing the
 * shared DST-correct rrule engine (`@rox/shared/rrule`). A one-off event is a
 * single occurrence if it overlaps the window; a recurring event walks
 * `nextOccurrenceAfter` from just before the window until past it, honouring
 * COUNT/UNTIL (the rrule engine returns null when exhausted) and EXDATEs.
 */

import { nextOccurrenceAfter } from "@rox/shared/rrule";

export interface ExpandableEvent {
	id: string;
	dtstart: Date;
	dtend: Date;
	timezone: string;
	/** All-day event: a zero/short duration still spans its whole calendar day. */
	allDay?: boolean;
	/** RFC 5545 RRULE body without the `RRULE:` prefix, or null for one-off. */
	rrule: string | null;
	/** UTC ISO instants to skip (RFC 5545 EXDATE). */
	exdates: string[];
}

export interface EventOccurrence {
	eventId: string;
	/** Occurrence start instant (real UTC). */
	start: Date;
	/** Occurrence end instant (real UTC), preserving the event's duration. */
	end: Date;
}

export interface ExpansionResult {
	occurrences: EventOccurrence[];
	/**
	 * True when expansion stopped at {@link MAX_OCCURRENCES} for at least one
	 * event before the recurrence was exhausted — i.e. results may be incomplete
	 * for the requested window (sub-daily cadences are the usual cause).
	 */
	truncated: boolean;
}

/** Safety cap so a pathological infinite rule can't run away. */
const MAX_OCCURRENCES = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` UTC calendar-day key for an instant. */
function utcDayKey(t: number): string {
	return new Date(t).toISOString().slice(0, 10);
}

/**
 * EXDATE matcher. RFC 5545 lets EXDATE be either an exact DATE-TIME instant or a
 * DATE-only value; an imported all-day EXDATE lands at midnight UTC and would
 * never millisecond-match a timed instance. We therefore match two ways (C3):
 *   - exact millisecond (timed EXDATE vs timed instance), and
 *   - by UTC calendar day for EXDATEs that fall exactly on UTC midnight (the
 *     DATE-only form), so a date-only EXDATE cancels that day's instance.
 */
function buildExdateMatcher(exdates: string[]): (start: Date) => boolean {
	const exactMs = new Set<number>();
	const dayKeys = new Set<string>();
	for (const raw of exdates) {
		const t = new Date(raw).getTime();
		if (!Number.isFinite(t)) continue;
		exactMs.add(t);
		// A midnight-UTC EXDATE is the DATE-only form: match by calendar day.
		if (t % DAY_MS === 0) dayKeys.add(utcDayKey(t));
	}
	return (start: Date): boolean => {
		const ms = start.getTime();
		if (exactMs.has(ms)) return true;
		return dayKeys.size > 0 && dayKeys.has(utcDayKey(ms));
	};
}

/**
 * Expand a single event into occurrences overlapping `[rangeStart, rangeEnd)`.
 *
 * An occurrence overlaps the window when `occurrenceStart < rangeEnd` and
 * `occurrenceEnd > rangeStart` (half-open), so an event that starts before the
 * window but is still running inside it is included.
 */
export function expandEvent(
	event: ExpandableEvent,
	rangeStart: Date,
	rangeEnd: Date,
): ExpansionResult {
	const rawDurationMs = event.dtend.getTime() - event.dtstart.getTime();
	// C2: an all-day event whose dtend == dtstart (zero duration) must still
	// render across its whole calendar day. Treat any non-positive all-day
	// duration as spanning to end-of-day so the half-open overlap test and the
	// emitted occurrence end both cover the grid cell. Timed events keep their
	// real duration unchanged.
	const durationMs =
		event.allDay && rawDurationMs <= 0 ? DAY_MS : rawDurationMs;
	const overlaps = (start: Date): boolean => {
		const end = new Date(start.getTime() + durationMs);
		return (
			start.getTime() < rangeEnd.getTime() &&
			end.getTime() > rangeStart.getTime()
		);
	};
	const toOccurrence = (start: Date): EventOccurrence => ({
		eventId: event.id,
		start,
		end: new Date(start.getTime() + durationMs),
	});

	// One-off event: a single instance if it overlaps the window.
	if (!event.rrule) {
		return {
			occurrences: overlaps(event.dtstart) ? [toOccurrence(event.dtstart)] : [],
			truncated: false,
		};
	}

	const isExcluded = buildExdateMatcher(event.exdates);
	const out: EventOccurrence[] = [];

	// Walk from just before whichever is later: the window start or the anchor.
	// Subtract the duration from `rangeStart` so a long event whose start is
	// before the window but whose body overlaps it is not missed.
	const walkFloor = new Date(
		Math.max(event.dtstart.getTime(), rangeStart.getTime() - durationMs) - 1,
	);
	let cursor = walkFloor;
	let truncated = false;
	let exhausted = false;

	for (let i = 0; i < MAX_OCCURRENCES; i++) {
		let next: Date | null;
		try {
			next = nextOccurrenceAfter({
				rrule: event.rrule,
				dtstart: event.dtstart,
				timezone: event.timezone,
				after: cursor,
			});
		} catch {
			// A poisoned RRULE row (e.g. a legacy `FREQ=BOGUS` that predates write
			// validation) must not throw the whole org's month/agenda query — skip
			// this event and let the rest of the batch expand.
			return { occurrences: out, truncated };
		}
		if (!next) {
			exhausted = true;
			break; // recurrence exhausted (COUNT/UNTIL)
		}
		if (next.getTime() >= rangeEnd.getTime()) {
			exhausted = true;
			break; // past the window
		}
		cursor = next;
		if (isExcluded(next)) continue; // EXDATE (exact instant or DATE-only day)
		if (overlaps(next)) out.push(toOccurrence(next));
	}

	// Hit the cap without exhausting the rule or leaving the window → the window
	// may be missing later instances; signal it so the UI can warn.
	if (!exhausted) truncated = true;

	return { occurrences: out, truncated };
}

/**
 * Expand a set of events into a flat, chronologically-sorted occurrence list
 * for a date-range query (month/agenda views). `truncated` is true when any
 * single event hit the per-event occurrence cap.
 */
export function expandEvents(
	events: ExpandableEvent[],
	rangeStart: Date,
	rangeEnd: Date,
): ExpansionResult {
	const all: EventOccurrence[] = [];
	let truncated = false;
	for (const e of events) {
		const result = expandEvent(e, rangeStart, rangeEnd);
		all.push(...result.occurrences);
		if (result.truncated) truncated = true;
	}
	all.sort((a, b) => a.start.getTime() - b.start.getTime());
	return { occurrences: all, truncated };
}
