/**
 * Conversions between a `Date` (UTC instant) and the `YYYY-MM-DDTHH:mm` string
 * an `<input type="datetime-local">` expects. We render/parse in UTC so the
 * value is deterministic and matches the calendar's stored instants (the event
 * timezone is selected separately in the dialog).
 */

/** UTC instant → `YYYY-MM-DDTHH:mm` for a datetime-local input. */
export function toDatetimeLocal(date: Date): string {
	return date.toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` (interpreted as UTC) → Date, or null when unparseable. */
export function fromDatetimeLocal(value: string): Date | null {
	if (!value) return null;
	const date = new Date(`${value}:00.000Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}
