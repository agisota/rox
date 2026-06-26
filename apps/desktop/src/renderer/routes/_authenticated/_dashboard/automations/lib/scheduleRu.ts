/**
 * RU-localised schedule + run formatters for the Automations surface.
 *
 * The shared `describeSchedule()` in `packages/shared/src/rrule.ts` hard-codes
 * English ("Daily", "Weekdays at 9:00 AM", "Custom") and flows untranslated
 * into the list column, the sidebar "Повтор" row, the run list and the cloud
 * `scheduleText` field — a real bug in a fully RU app. The proper fix is to
 * make the shared `describeSchedule` locale-aware (tracked under `needsShared`),
 * but that file lives outside this surface. Until then this module re-parses
 * the same RRULE shapes the picker can author and renders them in Russian so
 * the desktop surface reads correctly today.
 *
 * Parsing here intentionally mirrors `packages/shared/src/rrule.ts`
 * (`parseRruleParts` + `describeSchedule`) so the two never disagree on which
 * rules are "describable" vs "Custom".
 */

const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"] as const;
const WEEKENDS = ["SA", "SU"] as const;

/** Nominative (used after «по», lists). */
const DAY_LONG_RU: Record<string, string> = {
	MO: "понедельник",
	TU: "вторник",
	WE: "среда",
	TH: "четверг",
	FR: "пятница",
	SA: "суббота",
	SU: "воскресенье",
};

/** Genitive plural / "по <дням>" form for weekly cadence. */
const DAY_BY_RU: Record<string, string> = {
	MO: "понедельникам",
	TU: "вторникам",
	WE: "средам",
	TH: "четвергам",
	FR: "пятницам",
	SA: "субботам",
	SU: "воскресеньям",
};

const DAY_SHORT_RU: Record<string, string> = {
	MO: "пн",
	TU: "вт",
	WE: "ср",
	TH: "чт",
	FR: "пт",
	SA: "сб",
	SU: "вс",
};

const MONTH_LONG_RU = [
	"января",
	"февраля",
	"марта",
	"апреля",
	"мая",
	"июня",
	"июля",
	"августа",
	"сентября",
	"октября",
	"ноября",
	"декабря",
];

type RruleParts = Record<string, string>;

function parseRruleParts(rrule: string): RruleParts | null {
	const parts: RruleParts = {};
	for (const segment of rrule.split(";")) {
		const trimmed = segment.trim();
		if (!trimmed) continue;
		const eq = trimmed.indexOf("=");
		if (eq < 0) return null;
		const key = trimmed.slice(0, eq).trim().toUpperCase();
		const value = trimmed.slice(eq + 1).trim();
		if (!key || !value) return null;
		parts[key] = value;
	}
	return parts.FREQ ? parts : null;
}

function parseIntOrNull(value: string | undefined): number | null {
	if (value === undefined) return null;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : null;
}

function sortDays(days: string[]): string[] {
	return [...days].sort(
		(a, b) => DAY_ORDER.indexOf(a as never) - DAY_ORDER.indexOf(b as never),
	);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	return sortDays([...a]).join(",") === sortDays([...b]).join(",");
}

/** Wall-clock HH:MM in the automation's own TZ (24h, RU convention). */
function formatTimeOfDay(hour: number, minute: number): string {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Russian plural picker (1 минута / 2 минуты / 5 минут). */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
	return many;
}

/**
 * Human-readable cadence in Russian, e.g. "По будням в 09:00".
 * Returns "Свой вариант" for rules outside the handled patterns (mirrors the
 * shared `describeSchedule` "Custom" fallback).
 */
export function describeScheduleRu(rrule: string): string {
	const parts = parseRruleParts(rrule);
	if (!parts) return "Свой вариант";

	const freq = parts.FREQ;
	const interval = parseIntOrNull(parts.INTERVAL) ?? 1;
	const byHour = parseIntOrNull(parts.BYHOUR);
	const byMinute = parseIntOrNull(parts.BYMINUTE) ?? 0;
	const byDay = parts.BYDAY
		? parts.BYDAY.split(",")
				.map((d) => d.trim().toUpperCase())
				.filter((d) => d in DAY_LONG_RU)
		: [];
	const byMonth = parseIntOrNull(parts.BYMONTH);
	const byMonthDay = parseIntOrNull(parts.BYMONTHDAY);

	if (parts.BYSETPOS || parts.BYYEARDAY || parts.BYWEEKNO) {
		return "Свой вариант";
	}
	if (parts.COUNT || parts.UNTIL) return "Свой вариант";

	const atTime =
		byHour !== null ? ` в ${formatTimeOfDay(byHour, byMinute)}` : "";

	switch (freq) {
		case "MINUTELY":
			if (interval === 1) return "Каждую минуту";
			return `Каждые ${interval} ${plural(interval, "минуту", "минуты", "минут")}`;

		case "HOURLY":
			if (interval === 1) return "Каждый час";
			return `Каждые ${interval} ${plural(interval, "час", "часа", "часов")}`;

		case "DAILY":
			if (interval === 1) return `Ежедневно${atTime}`;
			return `Каждые ${interval} ${plural(interval, "день", "дня", "дней")}${atTime}`;

		case "WEEKLY": {
			if (interval !== 1) {
				if (byDay.length === 1) {
					return `Каждые ${interval} ${plural(interval, "неделю", "недели", "недель")} по ${DAY_BY_RU[byDay[0]]}${atTime}`;
				}
				return "Свой вариант";
			}
			if (byDay.length === 0) return `Еженедельно${atTime}`;
			if (sameSet(byDay, WEEKDAYS)) return `По будням${atTime}`;
			if (sameSet(byDay, WEEKENDS)) return `По выходным${atTime}`;
			if (byDay.length === 1) return `По ${DAY_BY_RU[byDay[0]]}${atTime}`;
			const list = sortDays(byDay)
				.map((d) => DAY_SHORT_RU[d])
				.join(", ");
			return `${list}${atTime}`;
		}

		case "MONTHLY": {
			if (interval !== 1) return "Свой вариант";
			if (byMonthDay === -1) return `В последний день месяца${atTime}`;
			if (byMonthDay !== null && byMonthDay >= 1 && byMonthDay <= 31) {
				return `Ежемесячно ${byMonthDay}-го числа${atTime}`;
			}
			if (byDay.length === 1) {
				return `Ежемесячно по ${DAY_BY_RU[byDay[0]]}${atTime}`;
			}
			return `Ежемесячно${atTime}`;
		}

		case "YEARLY": {
			if (interval !== 1) return "Свой вариант";
			if (
				byMonth !== null &&
				byMonth >= 1 &&
				byMonth <= 12 &&
				byMonthDay !== null
			) {
				return `Ежегодно ${byMonthDay} ${MONTH_LONG_RU[byMonth - 1]}${atTime}`;
			}
			return `Ежегодно${atTime}`;
		}

		default:
			return "Свой вариант";
	}
}

/**
 * Run duration `dispatchedAt − scheduledFor` as a compact RU label.
 * Returns null when either bound is missing (e.g. a still-pending run).
 */
export function formatRunDuration(
	scheduledFor: Date | string | null,
	dispatchedAt: Date | string | null,
): string | null {
	if (!scheduledFor || !dispatchedAt) return null;
	const start = new Date(scheduledFor).getTime();
	const end = new Date(dispatchedAt).getTime();
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	const ms = end - start;
	if (ms < 0) return null;
	if (ms < 1000) return `${ms} мс`;
	const totalSec = Math.round(ms / 1000);
	if (totalSec < 60)
		return `${totalSec} ${plural(totalSec, "сек", "сек", "сек")}`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min < 60) return sec ? `${min} мин ${sec} сек` : `${min} мин`;
	const hours = Math.floor(min / 60);
	const remMin = min % 60;
	return remMin ? `${hours} ч ${remMin} мин` : `${hours} ч`;
}

/**
 * Relative "до следующего запуска", e.g. "через 2 ч" / "сейчас" / "просрочено".
 * `target` is the next-run instant (real UTC); `now` ticks from `useNow`.
 */
export function nextRunRelativeRu(
	target: Date | string | null,
	now: Date,
): string | null {
	if (!target) return null;
	const t = new Date(target).getTime();
	if (!Number.isFinite(t)) return null;
	const diff = t - now.getTime();
	if (diff <= 0) return "сейчас";
	const sec = Math.round(diff / 1000);
	if (sec < 60) return "менее минуты";
	const min = Math.round(sec / 60);
	if (min < 60)
		return `через ${min} ${plural(min, "минуту", "минуты", "минут")}`;
	const hours = Math.round(min / 60);
	if (hours < 24)
		return `через ${hours} ${plural(hours, "час", "часа", "часов")}`;
	const days = Math.round(hours / 24);
	return `через ${days} ${plural(days, "день", "дня", "дней")}`;
}
