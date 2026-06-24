import { differenceInMinutes, format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Locale-correct date/time helpers for the journal, replacing the hand-rolled
 * `formatTimestamp`/`formatDay` in the legacy feed. All grouping is keyed on the
 * UTC calendar day — the journal data model stores `journal_entries.day` as a
 * UTC `date` and events carry UTC `created_at`, and the legacy code formatted
 * with `timeZone: "UTC"`, so we keep that contract to avoid off-by-one days.
 */

function toDate(value: Date | string): Date {
	return typeof value === "string" ? new Date(value) : value;
}

/**
 * Shift a timestamp by its timezone offset so that calling local `date-fns`
 * helpers (isToday / format) actually reasons in UTC. This is the standard
 * "render UTC instant as if local" trick — we never persist this value, it is
 * purely for display grouping.
 */
function asUtcWallClock(value: Date | string): Date {
	const date = toDate(value);
	return new Date(date.getTime() + date.getTimezoneOffset() * 60_000);
}

/** Stable per-day grouping key (`YYYY-MM-DD`, UTC) for an event timestamp. */
export function dayKeyOf(value: Date | string): string {
	const date = toDate(value);
	return date.toISOString().slice(0, 10);
}

/** A `YYYY-MM-DD` day string (entry.day or a feed group key) as a UTC Date. */
export function dayStringToDate(day: string): Date {
	return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Human group label for a UTC day key: «Сегодня» / «Вчера» / «24 июня»
 * (current year) / «24 июня 2025» (other years).
 */
export function groupLabel(day: string): string {
	const utc = asUtcWallClock(`${day}T12:00:00.000Z`);
	if (isToday(utc)) return "Сегодня";
	if (isYesterday(utc)) return "Вчера";
	const nowYear = asUtcWallClock(new Date()).getFullYear();
	const pattern = utc.getFullYear() === nowYear ? "d MMMM" : "d MMMM yyyy";
	return format(utc, pattern, { locale: ru });
}

/** Full weekday-bearing day label for the reflection lane («понедельник, 24 июня 2026»). */
export function reflectionDayLabel(day: string): string {
	const utc = asUtcWallClock(`${day}T12:00:00.000Z`);
	return format(utc, "EEEE, d MMMM yyyy", { locale: ru });
}

/** Relative time label: «только что» / «5 мин назад» / «3 ч назад» / absolute. */
export function relativeTime(value: Date | string): string {
	const date = toDate(value);
	const diffMin = differenceInMinutes(Date.now(), date);
	if (diffMin < 1) return "только что";
	if (diffMin < 60) return `${diffMin} мин назад`;
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) return `${diffHr} ч назад`;
	return format(asUtcWallClock(date), "d MMM, HH:mm", { locale: ru });
}

/** Absolute UTC timestamp for drill-down detail («24 июня 2026, 14:08»). */
export function absoluteTime(value: Date | string): string {
	return format(asUtcWallClock(value), "d MMMM yyyy, HH:mm", { locale: ru });
}
