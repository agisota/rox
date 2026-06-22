/**
 * Pure date helpers for the calendar agenda view. The calendar router expands
 * occurrences for an explicit `[rangeStart, rangeEnd)` window, so the view needs
 * the start of a month and the start of the next month to request a full month.
 */

/** Start of the month containing `date` (local time, 00:00:00.000). */
export function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** Start of the month AFTER the one containing `date` — the exclusive end. */
export function startOfNextMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * The half-open `[start, end)` window covering the whole month of `date`.
 * `end` is the first instant of the next month, matching the router's
 * `rangeEnd` exclusivity.
 */
export function monthRange(date: Date): { start: Date; end: Date } {
	return { start: startOfMonth(date), end: startOfNextMonth(date) };
}

/** Add `delta` months to `date`, anchored to the first of the month. */
export function addMonths(date: Date, delta: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);
}

/** A stable `YYYY-MM-DD` key for grouping occurrences by local calendar day. */
export function dayKey(date: Date): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}
