/**
 * Format a comms/chat timestamp for the thread list / message bubble.
 *
 * - Today        -> "HH:MM" (locale time)
 * - Same year    -> "D MMM" (locale short date, no year)
 * - Older / prior year -> locale short date with year
 *
 * Returns `null` for missing/invalid input so callers can render nothing.
 *
 * Mirrors the Mail feature's `formatMailDate` verbatim (same today/same-year/
 * older rule) so the chat surface formats stamps identically. Pure + testable.
 */
export function formatChatDate(
	value: Date | string | null | undefined,
	now: Date = new Date(),
): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	const sameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	if (sameDay) {
		return date.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	const sameYear = date.getFullYear() === now.getFullYear();
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		...(sameYear ? {} : { year: "numeric" }),
	});
}
