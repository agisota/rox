/**
 * Minimal RFC 5545 (iCalendar) import/export for the D6 calendar (P2).
 *
 * We support the VEVENT subset the calendar actually models: UID, SUMMARY,
 * DESCRIPTION, LOCATION, DTSTART/DTEND (UTC `Z` instants or all-day `VALUE=DATE`),
 * RRULE, and EXDATE. This is intentionally dependency-free: the shape is small,
 * well-specified, and round-trips with our own export. Calendar invite EMAIL is
 * deferred to P3 — P2 ships in-app invites + this .ics import/export only.
 */

export interface IcsEvent {
	uid?: string;
	title: string;
	description?: string | null;
	location?: string | null;
	dtstart: Date;
	dtend: Date;
	allDay?: boolean;
	/** RRULE body without the `RRULE:` prefix, or null for a one-off. */
	rrule?: string | null;
	/** UTC ISO instants to exclude (EXDATE). */
	exdates?: string[];
}

// ---- export ---------------------------------------------------------------

/** `2026-06-20T09:30:00.000Z` → `20260620T093000Z`. */
function toIcsUtc(date: Date): string {
	return `${date
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "")}`;
}

/** `2026-06-20T...Z` → `20260620` (all-day VALUE=DATE form). */
function toIcsDate(date: Date): string {
	return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** RFC 5545 §3.1: escape `\ ; , \n` in TEXT values. */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

function unescapeText(value: string): string {
	return value
		.replace(/\\n/gi, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";")
		.replace(/\\\\/g, "\\");
}

function serializeEvent(event: IcsEvent): string[] {
	const lines: string[] = ["BEGIN:VEVENT"];
	lines.push(`UID:${event.uid ?? crypto.randomUUID()}`);
	lines.push(`DTSTAMP:${toIcsUtc(new Date())}`);
	if (event.allDay) {
		lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.dtstart)}`);
		lines.push(`DTEND;VALUE=DATE:${toIcsDate(event.dtend)}`);
	} else {
		lines.push(`DTSTART:${toIcsUtc(event.dtstart)}`);
		lines.push(`DTEND:${toIcsUtc(event.dtend)}`);
	}
	lines.push(`SUMMARY:${escapeText(event.title)}`);
	if (event.description) {
		lines.push(`DESCRIPTION:${escapeText(event.description)}`);
	}
	if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
	if (event.rrule) lines.push(`RRULE:${event.rrule}`);
	if (event.exdates && event.exdates.length > 0) {
		const stamps = event.exdates
			.map((iso) => toIcsUtc(new Date(iso)))
			.join(",");
		lines.push(`EXDATE:${stamps}`);
	}
	lines.push("END:VEVENT");
	return lines;
}

/** Serialize events into a single VCALENDAR document (CRLF line endings). */
export function exportIcs(events: IcsEvent[], calendarName = "Rox"): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Rox//Calendar D6//EN",
		"CALSCALE:GREGORIAN",
		`X-WR-CALNAME:${escapeText(calendarName)}`,
	];
	for (const event of events) lines.push(...serializeEvent(event));
	lines.push("END:VCALENDAR");
	return `${lines.join("\r\n")}\r\n`;
}

// ---- import ---------------------------------------------------------------

/** Parse an iCalendar instant (`...Z`, floating, or `VALUE=DATE`) to a Date. */
function parseIcsInstant(value: string): { date: Date; isDate: boolean } {
	// All-day: `20260620`.
	if (/^\d{8}$/.test(value)) {
		const y = value.slice(0, 4);
		const m = value.slice(4, 6);
		const d = value.slice(6, 8);
		return { date: new Date(`${y}-${m}-${d}T00:00:00.000Z`), isDate: true };
	}
	// Date-time: `20260620T093000Z` (or without Z = treat as UTC).
	const match = value.match(
		/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
	);
	if (match) {
		const [, y, mo, d, h, mi, s] = match;
		return {
			date: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`),
			isDate: false,
		};
	}
	return { date: new Date(value), isDate: false };
}

/** Unfold RFC 5545 line continuations (a leading space/tab continues a line). */
function unfold(ics: string): string[] {
	const raw = ics.split(/\r?\n/);
	const out: string[] = [];
	for (const line of raw) {
		if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
			out[out.length - 1] += line.slice(1);
		} else {
			out.push(line);
		}
	}
	return out;
}

/** Split `NAME;PARAM=x:VALUE` into `{ name, params, value }`. */
function splitLine(line: string): {
	name: string;
	params: Record<string, string>;
	value: string;
} {
	const colon = line.indexOf(":");
	const head = colon < 0 ? line : line.slice(0, colon);
	const value = colon < 0 ? "" : line.slice(colon + 1);
	const [name = "", ...paramParts] = head.split(";");
	const params: Record<string, string> = {};
	for (const p of paramParts) {
		const eq = p.indexOf("=");
		if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
	}
	return { name: name.toUpperCase(), params, value };
}

/**
 * Parse a VCALENDAR document into events. Unknown properties are ignored; only
 * VEVENT blocks with a parseable DTSTART are returned.
 */
export function importIcs(ics: string): IcsEvent[] {
	const lines = unfold(ics);
	const events: IcsEvent[] = [];
	let current: Partial<IcsEvent> & { _hasStart?: boolean } = {};
	let inEvent = false;

	for (const line of lines) {
		const { name, params, value } = splitLine(line);
		if (name === "BEGIN" && value === "VEVENT") {
			inEvent = true;
			current = {};
			continue;
		}
		if (name === "END" && value === "VEVENT") {
			if (inEvent && current._hasStart && current.dtstart && current.dtend) {
				events.push({
					uid: current.uid,
					title: current.title ?? "(untitled)",
					description: current.description ?? null,
					location: current.location ?? null,
					dtstart: current.dtstart,
					dtend: current.dtend,
					allDay: current.allDay ?? false,
					rrule: current.rrule ?? null,
					exdates: current.exdates ?? [],
				});
			}
			inEvent = false;
			continue;
		}
		if (!inEvent) continue;

		switch (name) {
			case "UID":
				current.uid = value;
				break;
			case "SUMMARY":
				current.title = unescapeText(value);
				break;
			case "DESCRIPTION":
				current.description = unescapeText(value);
				break;
			case "LOCATION":
				current.location = unescapeText(value);
				break;
			case "DTSTART": {
				const { date, isDate } = parseIcsInstant(value);
				current.dtstart = date;
				current.allDay = isDate || params.VALUE === "DATE";
				current._hasStart = true;
				break;
			}
			case "DTEND": {
				const { date } = parseIcsInstant(value);
				current.dtend = date;
				break;
			}
			case "RRULE":
				current.rrule = value;
				break;
			case "EXDATE": {
				const stamps = value
					.split(",")
					.map((v) => parseIcsInstant(v).date.toISOString());
				current.exdates = [...(current.exdates ?? []), ...stamps];
				break;
			}
		}
	}

	// An event with a start but no end defaults to a zero-length instant.
	for (const e of events) {
		if (!e.dtend) e.dtend = e.dtstart;
	}
	return events;
}
