// Time unit constants (in milliseconds)
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

// Time threshold constants (in their respective units)
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

interface GetRelativeTimeOptions {
	format?: "default" | "compact";
}

/**
 * Russian plural picker — chooses among (one / few / many) forms for a count.
 * e.g. plural(1, "день", "дня", "дней") → "день"; plural(3, …) → "дня".
 */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
	return many;
}

/**
 * Returns a human-readable relative time string in Russian.
 * e.g., "только что", "вчера", "3 дня назад", "2 недели назад".
 *
 * `compact` keeps the terse latin-unit form (`5м`, `3ч`, `2д`) used in dense
 * surfaces; `default` is the full RU phrasing shown in the workspaces list.
 */
export function getRelativeTime(
	timestamp: number,
	options?: GetRelativeTimeOptions,
): string {
	const format = options?.format ?? "default";
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / MS_PER_MINUTE);
	const hours = Math.floor(diff / MS_PER_HOUR);
	const days = Math.floor(diff / MS_PER_DAY);

	if (format === "compact") {
		if (minutes < 1) return "сейчас";
		if (minutes < MINUTES_PER_HOUR) return `${minutes}м`;
		if (hours < HOURS_PER_DAY) return `${hours}ч`;
		if (days < DAYS_PER_WEEK) return `${days}д`;
		if (days < DAYS_PER_MONTH) return `${Math.floor(days / DAYS_PER_WEEK)}нед`;
		if (days < DAYS_PER_YEAR) return `${Math.floor(days / DAYS_PER_MONTH)}мес`;
		return `${Math.floor(days / DAYS_PER_YEAR)}г`;
	}

	if (minutes < 1) return "только что";
	if (minutes < MINUTES_PER_HOUR)
		return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;
	if (hours < HOURS_PER_DAY)
		return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
	if (days === 1) return "вчера";
	if (days < DAYS_PER_WEEK)
		return `${days} ${plural(days, "день", "дня", "дней")} назад`;
	if (days < DAYS_PER_MONTH) {
		const weeks = Math.floor(days / DAYS_PER_WEEK);
		return `${weeks} ${plural(weeks, "неделю", "недели", "недель")} назад`;
	}
	if (days < DAYS_PER_YEAR) {
		const months = Math.floor(days / DAYS_PER_MONTH);
		return `${months} ${plural(months, "месяц", "месяца", "месяцев")} назад`;
	}
	return "больше года назад";
}
