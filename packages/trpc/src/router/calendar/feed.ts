/**
 * Public calendar feed assembly (Calendar public ICS feed + free-busy).
 *
 * Pure, DB-free, side-effect-free so it is fully unit-testable: it takes an
 * already-loaded set of `cal_events` rows plus the calendar meta and renders
 * either
 *   - the FULL subscribe feed (real event detail; reuses {@link exportIcs} with
 *     the exact same `IcsEvent` mapping as the authed `calendar.exportIcs`
 *     procedure), or
 *   - the FREE-BUSY feed (busy intervals only, no detail): recurring events are
 *     expanded over a bounded window via {@link expandEvents}, collapsed into
 *     merged busy spans by {@link mergeBusyIntervals}, then serialized through
 *     {@link exportFreeBusyIcs} which structurally cannot leak event text.
 *
 * Cancelled events are excluded from both modes (the always-on public feed must
 * not advertise a cancelled meeting), mirroring `listOccurrences`.
 *
 * Per-occurrence overrides (RECURRENCE-ID rows from `cal_event_occurrences`) are
 * applied in BOTH modes so the public feed never advertises a cancelled instance
 * or a moved instance at its old time, mirroring `listOccurrences`:
 *   - free-busy: the override map is threaded into {@link expandEvents}, which
 *     drops cancelled instances and patches moved ones before they collapse into
 *     busy intervals (detail can never leak — only instants survive), and
 *   - full feed: the recurring master keeps its RRULE, a cancelled instance is
 *     added to that VEVENT's EXDATE (the client drops it), and a modified
 *     instance is emitted as an extra RECURRENCE-ID VEVENT (same UID) carrying
 *     the patched time/fields, the standard RFC 5545 exception representation.
 */

import type { SelectCalEvent } from "@rox/db/schema";
import {
	type BusyInterval,
	exportFreeBusyIcs,
	exportIcs,
	type IcsEvent,
} from "./ics";
import {
	applyOverride,
	type EventOccurrence,
	type ExpandableEvent,
	expandEvents,
	type OccurrenceOverride,
} from "./occurrences";

// Re-exported so the public feed HTTP route can type the override map it loads
// from `cal_event_occurrences` without reaching into the occurrences module.
export type { OccurrenceOverride } from "./occurrences";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default free-busy window: now-31d .. now+365d (bounded recurrence expansion). */
function defaultWindow(now = new Date()): { start: Date; end: Date } {
	return {
		start: new Date(now.getTime() - 31 * DAY_MS),
		end: new Date(now.getTime() + 365 * DAY_MS),
	};
}

export interface BuildFeedOptions {
	calendar: { name: string; timezone: string };
	events: SelectCalEvent[];
	busyOnly: boolean;
	/** Free-busy expansion window; defaults to now-31d .. now+365d. */
	window?: { start: Date; end: Date };
	/**
	 * Per-occurrence overrides (RECURRENCE-ID), grouped by event id, exactly as
	 * `listOccurrences` builds them from `cal_event_occurrences`. Optional and
	 * backward-compatible: when omitted, the feed expands the bare series. A
	 * cancelled override drops/EXDATEs the instance; a modified one patches its
	 * time/fields.
	 */
	overridesByEventId?: Map<string, OccurrenceOverride[]>;
}

/** Map a stored event row to the dependency-free ICS event shape (full feed). */
function toIcsEvent(e: SelectCalEvent): IcsEvent {
	return {
		uid: `${e.id}@rox.one`,
		title: e.title,
		description: e.description,
		location: e.location,
		dtstart: e.dtstart,
		dtend: e.dtend,
		allDay: e.allDay,
		rrule: e.rrule,
		exdates: e.exdates,
	};
}

/** Map a stored event row to the recurrence-expansion shape (free-busy feed). */
function toExpandable(e: SelectCalEvent): ExpandableEvent {
	return {
		id: e.id,
		dtstart: e.dtstart,
		dtend: e.dtend,
		timezone: e.timezone,
		allDay: e.allDay,
		rrule: e.rrule,
		exdates: e.exdates,
	};
}

/**
 * Collapse a set of busy spans into the minimal sorted set of non-overlapping
 * intervals: sort by start, then fold each interval into the previous one when
 * it starts at or before the running end (touching counts as overlapping, so
 * back-to-back meetings merge into one busy block).
 */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
	if (intervals.length === 0) return [];
	const sorted = [...intervals].sort(
		(a, b) => a.start.getTime() - b.start.getTime(),
	);
	const merged: BusyInterval[] = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		if (last && interval.start.getTime() <= last.end.getTime()) {
			// Overlapping or adjacent → extend the running interval's end.
			if (interval.end.getTime() > last.end.getTime()) last.end = interval.end;
		} else {
			merged.push({ start: interval.start, end: interval.end });
		}
	}
	return merged;
}

/**
 * Map an override-patched occurrence to a RECURRENCE-ID exception VEVENT for the
 * full feed: it shares the series UID, points its RECURRENCE-ID at the ORIGINAL
 * instant, and carries the patched DTSTART/DTEND. A "this event only" field edit
 * surfaces onto the exception (title/description/location/allDay); an unset
 * (null) override column inherits the series value so the instance still reads
 * sensibly. The series master VEVENT and its RRULE are emitted separately.
 */
function toOverrideIcsEvent(
	event: SelectCalEvent,
	patched: EventOccurrence,
): IcsEvent {
	return {
		uid: `${event.id}@rox.one`,
		recurrenceId: patched.originalStart ?? patched.start,
		title: patched.title ?? event.title,
		description: patched.description ?? event.description,
		location: patched.location ?? event.location,
		dtstart: patched.start,
		dtend: patched.end,
		allDay: patched.allDay ?? event.allDay,
		// An exception instance is a single occurrence: no RRULE/EXDATE of its own.
		rrule: null,
		exdates: [],
	};
}

/**
 * Expand one event into the full-feed VEVENT set, applying per-occurrence
 * overrides as standard RFC 5545 exceptions:
 *   - a one-off event (or a recurring event with no overrides) → the bare
 *     {@link toIcsEvent} master, unchanged;
 *   - a recurring event with overrides → the master VEVENT with every cancelled
 *     instant appended to its EXDATE (so the client drops it), plus one extra
 *     RECURRENCE-ID VEVENT per modified instant carrying the patched time/fields.
 * Overrides are a RECURRENCE-ID mechanism, so they are ignored for a one-off
 * event (no rrule), mirroring the expander.
 */
function toFullFeedEvents(
	event: SelectCalEvent,
	overrides: OccurrenceOverride[] | undefined,
): IcsEvent[] {
	const master = toIcsEvent(event);
	if (!event.rrule || !overrides || overrides.length === 0) return [master];

	const extraExdates: string[] = [];
	const exceptions: IcsEvent[] = [];
	for (const override of overrides) {
		if (override.cancelled) {
			// A cancelled instance becomes an EXDATE on the series so the client
			// removes that occurrence (the same logical EXDATE the authed path drops).
			extraExdates.push(override.originalStart.toISOString());
			continue;
		}
		// Reuse the shared override math so a moved instance preserves the series
		// duration (when only one side moves) exactly as the free-busy/authed path.
		const base: EventOccurrence = {
			eventId: event.id,
			start: override.originalStart,
			end: new Date(override.originalStart.getTime() + seriesDurationMs(event)),
			originalStart: override.originalStart,
		};
		const patched = applyOverride(base, override);
		if (patched) exceptions.push(toOverrideIcsEvent(event, patched));
	}

	const masterWithExdates: IcsEvent =
		extraExdates.length > 0
			? { ...master, exdates: [...(master.exdates ?? []), ...extraExdates] }
			: master;
	return [masterWithExdates, ...exceptions];
}

/** Series duration in ms (used to seed the override base instance). */
function seriesDurationMs(event: SelectCalEvent): number {
	return event.dtend.getTime() - event.dtstart.getTime();
}

/**
 * Build the public subscribe feed for a calendar. `busyOnly` selects the
 * detail-free free-busy variant. Pure: pass the loaded events, overrides, and
 * (optionally) a window; the route handler owns the DB read.
 */
export function buildPublicCalendarFeed(opts: BuildFeedOptions): string {
	// A cancelled event must not appear in either feed variant.
	const active = opts.events.filter((e) => e.status !== "cancelled");

	if (!opts.busyOnly) {
		const events = active.flatMap((e) =>
			toFullFeedEvents(e, opts.overridesByEventId?.get(e.id)),
		);
		return exportIcs(events, opts.calendar.name);
	}

	const window = opts.window ?? defaultWindow();
	// Thread overrides into the expander: cancelled instances drop and moved ones
	// are patched BEFORE collapsing into busy spans, so free-busy stays detail-free
	// yet correct. Mirrors `listOccurrences`.
	const { occurrences } = expandEvents(
		active.map(toExpandable),
		window.start,
		window.end,
		opts.overridesByEventId,
	);
	const intervals = mergeBusyIntervals(
		occurrences.map((o) => ({ start: o.start, end: o.end })),
	);
	return exportFreeBusyIcs(intervals, opts.calendar.name);
}
