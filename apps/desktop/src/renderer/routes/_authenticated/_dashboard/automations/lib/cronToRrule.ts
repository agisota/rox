/**
 * Best-effort 5-field cron to RFC 5545 RRULE body translation.
 *
 * The Cron tab in SchedulePicker renders a live human preview via cronstrue
 * (which speaks cron natively). To also show the next 5 runs we reuse the
 * existing automation.validateRrule endpoint, which expects an RRULE, so we
 * translate the subset of cron expressions that map cleanly onto the RRULE
 * shapes Rox already understands. Anything outside that subset (step values,
 * ranges in minute/hour, day-of-month plus day-of-week mixes) returns null,
 * and the caller falls back to preview-only.
 *
 * Cron field order: minute hour day-of-month month day-of-week.
 */

const DOW_TO_RRULE: Record<string, string> = {
	"0": "SU",
	"1": "MO",
	"2": "TU",
	"3": "WE",
	"4": "TH",
	"5": "FR",
	"6": "SA",
	"7": "SU",
};

function isWildcard(field: string): boolean {
	return field === "*" || field === "?";
}

/** Parse a single integer cron field; returns null on anything non-trivial. */
function singleInt(field: string): number | null {
	if (!/^\d+$/.test(field)) return null;
	return Number.parseInt(field, 10);
}

/** Parse a day-of-week field that is empty, a single day, a range or a list. */
function parseDow(field: string): string[] | null {
	if (isWildcard(field)) return [];
	const range = field.match(/^(\d)-(\d)$/);
	if (range) {
		const from = Number.parseInt(range[1], 10);
		const to = Number.parseInt(range[2], 10);
		if (from > to) return null;
		const out: string[] = [];
		for (let d = from; d <= to; d++) {
			const code = DOW_TO_RRULE[String(d)];
			if (!code) return null;
			if (!out.includes(code)) out.push(code);
		}
		return out;
	}
	if (/^(\d)(,\d)*$/.test(field)) {
		const out: string[] = [];
		for (const part of field.split(",")) {
			const code = DOW_TO_RRULE[part];
			if (!code) return null;
			if (!out.includes(code)) out.push(code);
		}
		return out;
	}
	return null;
}

export function cronToRrule(expression: string): string | null {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) return null;
	const [minF, hourF, domF, monF, dowF] = fields;

	const minute = singleInt(minF);
	if (minute === null || minute < 0 || minute > 59) return null;

	const dow = parseDow(dowF);
	if (dow === null) return null;

	// Hourly: minute set, every hour, no day/month/dow constraint.
	if (
		isWildcard(hourF) &&
		isWildcard(domF) &&
		isWildcard(monF) &&
		dow.length === 0
	) {
		return minute === 0 ? "FREQ=HOURLY" : `FREQ=HOURLY;BYMINUTE=${minute}`;
	}

	const hour = singleInt(hourF);
	if (hour === null || hour < 0 || hour > 23) return null;

	// Weekly on specific day(s); day-of-month must be wildcard.
	if (dow.length > 0 && isWildcard(domF) && isWildcard(monF)) {
		return `FREQ=WEEKLY;BYDAY=${dow.join(",")};BYHOUR=${hour};BYMINUTE=${minute}`;
	}

	// Monthly on a day-of-month, optionally pinned to a month (yearly).
	if (!isWildcard(domF) && dow.length === 0) {
		const dom = singleInt(domF);
		if (dom === null || dom < 1 || dom > 31) return null;
		if (!isWildcard(monF)) {
			const month = singleInt(monF);
			if (month === null || month < 1 || month > 12) return null;
			return `FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=${dom};BYHOUR=${hour};BYMINUTE=${minute}`;
		}
		return `FREQ=MONTHLY;BYMONTHDAY=${dom};BYHOUR=${hour};BYMINUTE=${minute}`;
	}

	// Daily at a fixed time.
	if (isWildcard(domF) && isWildcard(monF) && dow.length === 0) {
		return `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute}`;
	}

	return null;
}
