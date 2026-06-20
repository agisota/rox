/**
 * Pure month-grid math for the calendar month view. Builds the 6×7 cell grid
 * (always 42 cells so the grid height is stable across months) starting on
 * Monday, in UTC so the math is deterministic and test-stable.
 */

export interface MonthCell {
	/** UTC midnight of the day this cell represents. */
	date: Date;
	/** ISO date key `YYYY-MM-DD` for matching occurrences. */
	key: string;
	/** Whether the cell belongs to the displayed month (vs. spill-over). */
	inMonth: boolean;
}

export interface MonthGrid {
	year: number;
	/** 0-based month. */
	month: number;
	/** UTC midnight of the first visible cell. */
	rangeStart: Date;
	/** UTC midnight just after the last visible cell (exclusive). */
	rangeEnd: Date;
	cells: MonthCell[];
}

/** `YYYY-MM-DD` in UTC. */
export function isoDateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Monday-based weekday index (Mon=0 … Sun=6) for a UTC date. */
function mondayIndex(date: Date): number {
	return (date.getUTCDay() + 6) % 7;
}

/** Build the 42-cell month grid containing `anchor`'s month. */
export function buildMonthGrid(anchor: Date): MonthGrid {
	const year = anchor.getUTCFullYear();
	const month = anchor.getUTCMonth();

	const firstOfMonth = new Date(Date.UTC(year, month, 1));
	const start = new Date(firstOfMonth);
	start.setUTCDate(1 - mondayIndex(firstOfMonth));

	const cells: MonthCell[] = [];
	for (let i = 0; i < 42; i++) {
		const date = new Date(start);
		date.setUTCDate(start.getUTCDate() + i);
		cells.push({
			date,
			key: isoDateKey(date),
			inMonth: date.getUTCMonth() === month,
		});
	}

	const rangeEnd = new Date(start);
	rangeEnd.setUTCDate(start.getUTCDate() + 42);

	return { year, month, rangeStart: start, rangeEnd, cells };
}

/** Step a month anchor by `delta` months, keeping a safe day-of-month. */
export function shiftMonth(anchor: Date, delta: number): Date {
	return new Date(
		Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1),
	);
}
