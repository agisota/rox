"use client";

import { Button } from "@rox/ui/button";
import { useCalendarActions } from "../../hooks/useCalendarActions";
import type { OccurrenceItem } from "./MonthView";

interface AgendaViewProps {
	occurrences: OccurrenceItem[];
	eventsById: Map<string, { id: string; title: string; allDay: boolean }>;
	/** Opens the clicked instance for edit; the occurrence carries its real start/end and any per-occurrence override. */
	onSelectEvent: (occurrence: OccurrenceItem) => void;
}

function formatDay(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		weekday: "short",
		day: "numeric",
		month: "long",
	}).format(new Date(iso));
}

function formatRange(start: string, end: string, allDay: boolean): string {
	if (allDay) return "Весь день";
	const fmt = new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

/** Chronological list of occurrences in the visible range, with inline RSVP. */
export function AgendaView({
	occurrences,
	eventsById,
	onSelectEvent,
}: AgendaViewProps) {
	const { rsvp } = useCalendarActions();

	if (occurrences.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
				Нет событий в этом месяце.
			</div>
		);
	}

	// Group by ISO day for section headers.
	const groups = new Map<string, OccurrenceItem[]>();
	for (const occ of occurrences) {
		const key = occ.start.slice(0, 10);
		const list = groups.get(key) ?? [];
		list.push(occ);
		groups.set(key, list);
	}

	return (
		<div className="space-y-6">
			{Array.from(groups.entries()).map(([day, items]) => (
				<section key={day} className="space-y-2">
					<h2 className="font-medium text-muted-foreground text-sm">
						{formatDay(`${day}T00:00:00.000Z`)}
					</h2>
					<ul className="divide-y rounded-lg border">
						{items.map((occ, i) => {
							const event = eventsById.get(occ.eventId);
							// Per-occurrence override wins over the series value.
							const allDay = occ.allDay ?? event?.allDay ?? false;
							const title = occ.title ?? event?.title ?? "Событие";
							return (
								<li
									key={`${occ.eventId}-${occ.start}-${i}`}
									className="flex items-center justify-between gap-3 p-3"
								>
									<button
										type="button"
										onClick={() => onSelectEvent(occ)}
										className="min-w-0 flex-1 text-left"
									>
										<p className="truncate font-medium text-sm">{title}</p>
										<p className="text-muted-foreground text-xs tabular-nums">
											{formatRange(occ.start, occ.end, allDay)}
										</p>
									</button>
									<div className="flex shrink-0 gap-1">
										<Button
											size="sm"
											variant="outline"
											disabled={rsvp.isPending}
											onClick={() =>
												rsvp.mutate({
													eventId: occ.eventId,
													status: "accepted",
												})
											}
										>
											Принять
										</Button>
										<Button
											size="sm"
											variant="ghost"
											disabled={rsvp.isPending}
											onClick={() =>
												rsvp.mutate({
													eventId: occ.eventId,
													status: "declined",
												})
											}
										>
											Отклонить
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
