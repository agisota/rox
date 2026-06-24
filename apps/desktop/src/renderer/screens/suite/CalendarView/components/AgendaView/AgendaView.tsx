import { MotionList, MotionListItem } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { MapPin } from "lucide-react";
import type {
	CalendarColorById,
	EventsById,
	OccurrenceItem,
} from "../../types";

interface AgendaViewProps {
	occurrences: OccurrenceItem[];
	eventsById: EventsById;
	colorById: CalendarColorById;
	/** Opens the clicked instance in the shared EventDialog (edit). */
	onSelectEvent: (occurrence: OccurrenceItem) => void;
}

function formatDay(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		weekday: "long",
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

/**
 * Chronological grouped-by-day agenda. Ported from the desktop's prior agenda +
 * the web AgendaView, with one change per spec: a row now opens the shared
 * EventDialog (edit) instead of the RSVP-only dialog, so all four views share a
 * single detail/edit surface. Cache-first: rows render from whatever the range
 * query last returned. Motion: staggered list entrance via the @rox/ui kit
 * (reduced-motion → instant final state).
 */
export function AgendaView({
	occurrences,
	eventsById,
	colorById,
	onSelectEvent,
}: AgendaViewProps) {
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
					<h2 className="font-medium text-muted-foreground text-sm capitalize">
						{formatDay(`${day}T00:00:00.000Z`)}
					</h2>
					<MotionList className="space-y-1.5">
						{items.map((occ, i) => {
							const event = eventsById.get(occ.eventId);
							// Per-occurrence override wins over the series value.
							const allDay = occ.allDay ?? event?.allDay ?? false;
							const title = occ.title ?? event?.title ?? "Событие";
							const location = occ.location;
							const color = event ? colorById.get(event.calendarId) : undefined;
							return (
								<MotionListItem key={`${occ.eventId}-${occ.start}-${i}`}>
									<button
										type="button"
										onClick={() => onSelectEvent(occ)}
										className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50"
									>
										<span
											aria-hidden
											className={cn(
												"size-2 shrink-0 rounded-full",
												!color && "bg-primary",
											)}
											style={color ? { backgroundColor: color } : undefined}
										/>
										<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
											{formatRange(occ.start, occ.end, allDay)}
										</span>
										<span className="min-w-0 flex-1 truncate text-sm">
											{title}
										</span>
										{location && (
											<span className="hidden shrink-0 items-center gap-1 text-muted-foreground text-xs sm:flex">
												<MapPin className="size-3" />
												<span className="max-w-32 truncate">{location}</span>
											</span>
										)}
									</button>
								</MotionListItem>
							);
						})}
					</MotionList>
				</section>
			))}
		</div>
	);
}
