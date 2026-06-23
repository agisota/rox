/**
 * Build an agenda (chronological, day-grouped sections) from calendar
 * occurrences + their parent events. Each occurrence references an `eventId`;
 * we join it to the event for title/location, sort by start time, and group by
 * local calendar day. Pure + deterministic so it is unit-testable.
 */

export interface AgendaOccurrence {
	eventId: string;
	start: string;
	end: string;
}

export interface AgendaEvent {
	id: string;
	title: string;
	location: string | null;
	allDay: boolean;
}

export interface AgendaItem {
	eventId: string;
	title: string;
	location: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
}

export interface AgendaSection {
	title: string;
	dayKey: string;
	data: AgendaItem[];
}

/** Local-day key (YYYY-MM-DD) used for grouping + stable section identity. */
export function dayKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function buildAgenda(
	occurrences: AgendaOccurrence[],
	events: AgendaEvent[],
): AgendaSection[] {
	const eventById = new Map(events.map((e) => [e.id, e]));

	const items: AgendaItem[] = [];
	for (const occ of occurrences) {
		const event = eventById.get(occ.eventId);
		if (!event) continue;
		const start = new Date(occ.start);
		const end = new Date(occ.end);
		if (Number.isNaN(start.getTime())) continue;
		items.push({
			eventId: occ.eventId,
			title: event.title,
			location: event.location,
			allDay: event.allDay,
			start,
			end,
		});
	}

	items.sort((a, b) => a.start.getTime() - b.start.getTime());

	const sections: AgendaSection[] = [];
	const byKey = new Map<string, AgendaSection>();
	for (const item of items) {
		const key = dayKey(item.start);
		let section = byKey.get(key);
		if (!section) {
			section = {
				dayKey: key,
				title: item.start.toLocaleDateString(undefined, {
					weekday: "short",
					month: "short",
					day: "numeric",
				}),
				data: [],
			};
			byKey.set(key, section);
			sections.push(section);
		}
		section.data.push(item);
	}

	return sections;
}
