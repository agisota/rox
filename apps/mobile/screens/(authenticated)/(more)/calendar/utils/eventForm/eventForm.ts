/**
 * Pure helpers for the Calendar event create/edit form. The form keeps editable
 * date + time as plain strings (`YYYY-MM-DD` and `HH:MM`) so it works without a
 * native picker dependency; these helpers convert between those strings and the
 * `Date` objects the calendar router expects. All math is local-time and
 * deterministic for unit testing.
 */

export interface EventFormValues {
	title: string;
	location: string;
	/** `YYYY-MM-DD`. */
	startDate: string;
	/** `HH:MM` (24h). Ignored when `allDay`. */
	startTime: string;
	endDate: string;
	endTime: string;
	allDay: boolean;
	/** Comma/space separated attendee emails (parsed on submit). */
	attendees: string;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** `Date` → `YYYY-MM-DD` in local time. */
export function toDateInput(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `Date` → `HH:MM` in local time. */
export function toTimeInput(date: Date): string {
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Combine a `YYYY-MM-DD` date and `HH:MM` time into a local `Date`. Returns
 * `null` when either part is malformed so callers can surface a validation
 * error instead of sending an Invalid Date.
 */
export function combineDateTime(
	dateStr: string,
	timeStr: string,
	allDay: boolean,
): Date | null {
	const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
	if (!dm) return null;
	const year = Number(dm[1]);
	const month = Number(dm[2]);
	const day = Number(dm[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	let hours = 0;
	let minutes = 0;
	if (!allDay) {
		const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
		if (!tm) return null;
		hours = Number(tm[1]);
		minutes = Number(tm[2]);
		if (hours > 23 || minutes > 59) return null;
	}

	const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

/**
 * Parse the free-text attendees field into a deduped list of email addresses.
 * Splits on commas, whitespace, and semicolons; drops blanks and anything that
 * is obviously not an email.
 */
export function parseAttendeeEmails(input: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of input.split(/[\s,;]+/)) {
		const email = raw.trim().toLowerCase();
		if (email.length === 0) continue;
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
		if (seen.has(email)) continue;
		seen.add(email);
		out.push(email);
	}
	return out;
}

export interface EventFormResult {
	title: string;
	location: string | null;
	dtstart: Date;
	dtend: Date;
	allDay: boolean;
	attendeeEmails: string[];
}

export type EventFormValidation =
	| { ok: true; value: EventFormResult }
	| { ok: false; error: string };

/** Validate the form and produce router-ready values (or a user-facing error). */
export function validateEventForm(
	values: EventFormValues,
): EventFormValidation {
	const title = values.title.trim();
	if (title.length === 0) return { ok: false, error: "Title is required." };

	const dtstart = combineDateTime(
		values.startDate,
		values.startTime,
		values.allDay,
	);
	if (!dtstart) return { ok: false, error: "Start date/time is invalid." };

	const dtend = combineDateTime(values.endDate, values.endTime, values.allDay);
	if (!dtend) return { ok: false, error: "End date/time is invalid." };

	if (dtend.getTime() < dtstart.getTime()) {
		return { ok: false, error: "End must not be before start." };
	}

	return {
		ok: true,
		value: {
			title,
			location: values.location.trim() || null,
			dtstart,
			dtend,
			allDay: values.allDay,
			attendeeEmails: parseAttendeeEmails(values.attendees),
		},
	};
}
