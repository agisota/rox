import { dayKey } from "../buildAgenda";

/**
 * Build a fixed 6×7 month grid (Sunday-first) for the month containing
 * `anchor`, marking which days carry at least one occurrence. Pure +
 * deterministic so the month-view layout is unit-testable without rendering.
 *
 * The grid always has 42 cells so the calendar height never jumps between
 * months. Leading/trailing cells belong to the adjacent months and are flagged
 * via `inMonth: false` so the UI can dim them.
 */

export interface MonthCell {
	date: Date;
	dayKey: string;
	/** Day-of-month number (1–31). */
	day: number;
	/** Whether this cell falls in the anchor month (vs. a spill-over day). */
	inMonth: boolean;
	/** True when the cell is today (local time). */
	isToday: boolean;
	/** Number of occurrences starting on this local day. */
	eventCount: number;
}

export interface MonthGrid {
	/** First day of the anchor month, local midnight. */
	monthStart: Date;
	/** "June 2026" — localized month + year title. */
	title: string;
	/** 42 cells (6 weeks × 7 days), Sunday-first. */
	cells: MonthCell[];
}

const DAYS_IN_GRID = 42;

/** Local midnight for the given date (strips the time component). */
function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Count occurrences per local day. Accepts occurrence start times as ISO
 * strings (the {@link listOccurrences} shape). Invalid dates are skipped.
 */
export function countOccurrencesByDay(
	occurrences: { start: string }[],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const occ of occurrences) {
		const start = new Date(occ.start);
		if (Number.isNaN(start.getTime())) continue;
		const key = dayKey(start);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

export function buildMonthGrid(
	anchor: Date,
	occurrences: { start: string }[],
	today: Date = new Date(),
): MonthGrid {
	const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const counts = countOccurrencesByDay(occurrences);
	const todayKey = dayKey(startOfDay(today));

	// Back up to the Sunday on/just before the 1st.
	const gridStart = new Date(monthStart);
	gridStart.setDate(monthStart.getDate() - monthStart.getDay());

	const cells: MonthCell[] = [];
	for (let i = 0; i < DAYS_IN_GRID; i++) {
		const date = new Date(
			gridStart.getFullYear(),
			gridStart.getMonth(),
			gridStart.getDate() + i,
		);
		const key = dayKey(date);
		cells.push({
			date,
			dayKey: key,
			day: date.getDate(),
			inMonth: date.getMonth() === monthStart.getMonth(),
			isToday: key === todayKey,
			eventCount: counts.get(key) ?? 0,
		});
	}

	return {
		monthStart,
		title: monthStart.toLocaleDateString(undefined, {
			month: "long",
			year: "numeric",
		}),
		cells,
	};
}

/** Step the anchor month by `delta` months, preserving local-midnight day 1. */
export function shiftMonth(anchor: Date, delta: number): Date {
	return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}
