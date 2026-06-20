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

/** Safety cap so a pathological infinite rule can't run away. */
const MAX_OCCURRENCES = 1000;

/** Normalize an instant to its millisecond key for EXDATE comparison. */
function exdateKeys(exdates: string[]): Set<number> {
	const keys = new Set<number>();
	for (const raw of exdates) {
		const t = new Date(raw).getTime();
		if (Number.isFinite(t)) keys.add(t);
	}
	return keys;
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
): EventOccurrence[] {
	const durationMs = event.dtend.getTime() - event.dtstart.getTime();
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
		return overlaps(event.dtstart) ? [toOccurrence(event.dtstart)] : [];
	}

	const skip = exdateKeys(event.exdates);
	const out: EventOccurrence[] = [];

	// Walk from just before whichever is later: the window start or the anchor.
	// Subtract the duration from `rangeStart` so a long event whose start is
	// before the window but whose body overlaps it is not missed.
	const walkFloor = new Date(
		Math.max(event.dtstart.getTime(), rangeStart.getTime() - durationMs) - 1,
	);
	let cursor = walkFloor;

	for (let i = 0; i < MAX_OCCURRENCES; i++) {
		const next = nextOccurrenceAfter({
			rrule: event.rrule,
			dtstart: event.dtstart,
			timezone: event.timezone,
			after: cursor,
		});
		if (!next) break; // recurrence exhausted (COUNT/UNTIL)
		if (next.getTime() >= rangeEnd.getTime()) break; // past the window
		cursor = next;
		if (skip.has(next.getTime())) continue; // EXDATE
		if (overlaps(next)) out.push(toOccurrence(next));
	}

	return out;
}

/**
 * Expand a set of events into a flat, chronologically-sorted occurrence list
 * for a date-range query (month/agenda views).
 */
export function expandEvents(
	events: ExpandableEvent[],
	rangeStart: Date,
	rangeEnd: Date,
): EventOccurrence[] {
	const all = events.flatMap((e) => expandEvent(e, rangeStart, rangeEnd));
	all.sort((a, b) => a.start.getTime() - b.start.getTime());
	return all;
}
