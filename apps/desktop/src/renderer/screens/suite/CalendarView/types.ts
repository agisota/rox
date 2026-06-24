import type { RouterOutputs } from "@rox/trpc";

/**
 * Shared view types for the desktop calendar surface. All four views (Month /
 * Week / Day / Agenda) consume the same `listOccurrences` payload, so the row +
 * event + calendar shapes live here to keep them in lockstep.
 */

type ListOccurrencesOutput = RouterOutputs["calendar"]["listOccurrences"];

/** One expanded occurrence as returned by `calendar.listOccurrences`. */
export type OccurrenceItem = ListOccurrencesOutput["occurrences"][number];

/** A raw event row (series defaults) as returned by `listOccurrences.events`. */
export type CalendarEvent = ListOccurrencesOutput["events"][number];

/** A calendar row as returned by `calendar.listCalendars` (feed token stripped). */
export type CalendarRow = RouterOutputs["calendar"]["listCalendars"][number];

/**
 * The event lookup the grids use to resolve a chip's series-level fields and the
 * owning calendar (for color tinting). Built once per query in CalendarView.
 */
export interface EventLookupEntry {
	id: string;
	title: string;
	allDay: boolean;
	calendarId: string;
}

export type EventsById = Map<string, EventLookupEntry>;

/** calendarId → resolved chip color (calendar.color or undefined for default). */
export type CalendarColorById = Map<string, string | undefined>;
