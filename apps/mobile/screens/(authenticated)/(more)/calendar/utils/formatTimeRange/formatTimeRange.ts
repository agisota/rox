/**
 * Local time range label for an occurrence ("9:00 AM – 9:15 AM"), or "All day"
 * for an all-day event. Pure + locale-driven so it is unit-testable.
 */
export function formatTimeRange(
	start: Date,
	end: Date,
	allDay: boolean,
): string {
	if (allDay) return "All day";
	const fmt = (d: Date) =>
		d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	return `${fmt(start)} – ${fmt(end)}`;
}
