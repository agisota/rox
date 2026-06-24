import { formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Relative time for an inbox row ("5 мин назад"), replacing the old manual
 * `toLocaleString` formatting. RU-locale via `date-fns`. Returns "" for a
 * missing/invalid date so the row never renders the string "Invalid Date".
 */
export function formatRelativeTime(
	value: Date | string | null | undefined,
): string {
	const date = toDate(value);
	if (!date) return "";
	return formatDistanceToNowStrict(date, { addSuffix: true, locale: ru });
}

/** Sticky date-group bucket for the thread list ("Сегодня" / "Вчера" / "Ранее"). */
export type DateGroup = "today" | "yesterday" | "earlier";

/** The RU label shown in the sticky group header. */
export const DATE_GROUP_LABEL: Record<DateGroup, string> = {
	today: "Сегодня",
	yesterday: "Вчера",
	earlier: "Ранее",
};

/** Bucket a timestamp into the list's sticky date group. */
export function dateGroupOf(
	value: Date | string | null | undefined,
): DateGroup {
	const date = toDate(value);
	if (!date) return "earlier";
	if (isToday(date)) return "today";
	if (isYesterday(date)) return "yesterday";
	return "earlier";
}

/** Coerce a nullable Date|string into a valid Date, or null. */
function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
