/**
 * URL-search persistence model for the Calendar surface (#538).
 *
 * The Calendar's navigation state — which VIEW (month/week/day/agenda), which
 * ANCHOR day, and which CALENDARS are in scope — is persisted in the route's
 * `?view=&anchor=&calendars=` search params so it survives reload and the
 * router Back button (matching the Tasks/Automations URL-driven pattern in this
 * repo). This module is the pure, router-free core of that feature:
 *
 *   - {@link calendarSearchSchema} parses raw search into a normalized shape with
 *     defaults, used as the route's `validateSearch` — invalid values fall back
 *     to defaults rather than throwing (a hand-edited bad URL still renders).
 *   - {@link anchorToParam} / {@link paramToAnchor} (de)serialize the anchor as a
 *     UTC `YYYY-MM-DD` day via the shared {@link startOfUtcDay}, so the stored
 *     value is a stable calendar day, never a full instant.
 *
 * Keeping the parse/serialize math here (db-free, router-free) lets it be
 * unit-tested directly and reused by web/mobile shells that drive the same
 * `listOccurrences` window from their own router.
 */

import { z } from "zod";
import { startOfUtcDay } from "./timeGrid";

/** The four calendar layouts; the URL `view` param is one of these. */
export const CALENDAR_VIEWS = ["month", "week", "day", "agenda"] as const;
export type CalendarViewMode = (typeof CALENDAR_VIEWS)[number];

/** Default layout when the URL omits / mis-spells `view`. */
export const DEFAULT_CALENDAR_VIEW: CalendarViewMode = "month";

/** `YYYY-MM-DD` — the serialized form of the anchor day. */
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format a UTC instant as the `YYYY-MM-DD` day it falls on. */
export function anchorToParam(anchor: Date): string {
	return startOfUtcDay(anchor).toISOString().slice(0, 10);
}

/**
 * Parse a `YYYY-MM-DD` param back into the UTC midnight of that day. A missing,
 * malformed, or non-calendar value (e.g. `2026-13-40`) falls back to today's UTC
 * day so the grid always has a valid anchor.
 */
export function paramToAnchor(param: string | undefined): Date {
	if (param && ISO_DAY_RE.test(param)) {
		const ms = Date.parse(`${param}T00:00:00.000Z`);
		if (!Number.isNaN(ms)) {
			const candidate = new Date(ms);
			// Reject roll-over dates (`2026-02-31` → Mar 3): require a round-trip.
			if (anchorToParam(candidate) === param) return candidate;
		}
	}
	return startOfUtcDay(new Date());
}

/**
 * The route's `validateSearch` schema. Every field is OPTIONAL and tolerant so
 * the surface stays navigable WITHOUT search (a plain `<Link to="/calendar">`
 * from the sidebar is valid); the route page fills the gaps via
 * {@link resolveCalendarSearch}. Tolerance: an unknown `view` → undefined (→
 * month at read); a bad `anchor` → undefined (→ today at read); `calendars`
 * coerces a lone string into a one-element array and drops non-strings.
 *
 * Keeping the params optional at the type level is the idiomatic TanStack
 * pattern: `validateSearch` never forces every navigation to spell out the full
 * state, while reads are normalized to concrete values exactly once.
 */
export const calendarSearchSchema = z.object({
	view: z.enum(CALENDAR_VIEWS).catch(DEFAULT_CALENDAR_VIEW).optional(),
	anchor: z
		.string()
		.transform((value) => anchorToParam(paramToAnchor(value)))
		.catch(() => anchorToParam(startOfUtcDay(new Date())))
		.optional(),
	calendars: z
		.preprocess((value) => {
			if (Array.isArray(value))
				return value.filter((v) => typeof v === "string");
			if (typeof value === "string" && value.length > 0) return [value];
			return undefined;
		}, z.array(z.string()).optional())
		.catch(undefined),
});

/** The raw (optional) search shape produced by `validateSearch`. */
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/** The concrete, fully-defaulted navigation state read by the screen. */
export interface ResolvedCalendarSearch {
	view: CalendarViewMode;
	anchor: string;
	calendars: string[];
}

/**
 * Fill an (optional) search shape with the same defaults the schema implies, so
 * the screen always receives a concrete `view`/`anchor`/`calendars`. Centralizes
 * the "no scope filter = []" + "no anchor = today" + "no view = month" rules in
 * one place shared by the route page and any web/mobile shell.
 */
export function resolveCalendarSearch(
	search: CalendarSearch,
): ResolvedCalendarSearch {
	return {
		view: search.view ?? DEFAULT_CALENDAR_VIEW,
		anchor: search.anchor ?? anchorToParam(startOfUtcDay(new Date())),
		calendars: search.calendars ?? [],
	};
}
