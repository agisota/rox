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
 */

import type { SelectCalEvent } from "@rox/db/schema";
import {
	type BusyInterval,
	exportFreeBusyIcs,
	exportIcs,
	type IcsEvent,
} from "./ics";
import { type ExpandableEvent, expandEvents } from "./occurrences";

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
 * Build the public subscribe feed for a calendar. `busyOnly` selects the
 * detail-free free-busy variant. Pure: pass the loaded events and (optionally) a
 * window; the route handler owns the DB read.
 */
export function buildPublicCalendarFeed(opts: BuildFeedOptions): string {
	// A cancelled event must not appear in either feed variant.
	const active = opts.events.filter((e) => e.status !== "cancelled");

	if (!opts.busyOnly) {
		return exportIcs(active.map(toIcsEvent), opts.calendar.name);
	}

	const window = opts.window ?? defaultWindow();
	const { occurrences } = expandEvents(
		active.map(toExpandable),
		window.start,
		window.end,
	);
	const intervals = mergeBusyIntervals(
		occurrences.map((o) => ({ start: o.start, end: o.end })),
	);
	return exportFreeBusyIcs(intervals, opts.calendar.name);
}
