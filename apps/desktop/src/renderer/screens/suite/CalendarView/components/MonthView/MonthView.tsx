import { cn } from "@rox/ui/utils";
import type {
	CalendarColorById,
	EventsById,
	OccurrenceItem,
} from "../../types";
import { isoDateKey, type MonthGrid } from "../../utils/monthGrid";

const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface MonthViewProps {
	grid: MonthGrid;
	occurrences: OccurrenceItem[];
	eventsById: EventsById;
	/** calendarId → color, for per-calendar chip tinting. */
	colorById: CalendarColorById;
	onSelectDay: (day: Date) => void;
	/** Opens the clicked instance for edit; the occurrence carries its real start/end and any per-occurrence override. */
	onSelectEvent: (occurrence: OccurrenceItem) => void;
}

const todayKey = () => isoDateKey(new Date());

function formatTime(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

/**
 * The 6×7 month grid with each day's occurrence chips. Ported from the web
 * MonthView; the desktop adds per-calendar color tinting (chip background/text
 * derive from the owning calendar's `color`, falling back to the primary token).
 */
export function MonthView({
	grid,
	occurrences,
	eventsById,
	colorById,
	onSelectDay,
	onSelectEvent,
}: MonthViewProps) {
	const byDay = new Map<string, OccurrenceItem[]>();
	for (const occ of occurrences) {
		const key = occ.start.slice(0, 10);
		const list = byDay.get(key) ?? [];
		list.push(occ);
		byDay.set(key, list);
	}

	const today = todayKey();

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card/40">
			<div className="grid grid-cols-7 border-b bg-muted/50">
				{WEEKDAYS_RU.map((d) => (
					<div
						key={d}
						className="px-2 py-1.5 text-center font-medium text-muted-foreground text-xs"
					>
						{d}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7">
				{grid.cells.map((cell) => {
					const dayOccs = byDay.get(cell.key) ?? [];
					return (
						<button
							type="button"
							key={cell.key}
							onClick={() => onSelectDay(cell.date)}
							className={cn(
								"min-h-24 border-r border-b p-1 text-left align-top transition-colors hover:bg-accent/50",
								!cell.inMonth && "bg-muted/30 text-muted-foreground",
							)}
						>
							<span
								className={cn(
									"inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
									cell.key === today &&
										"bg-primary font-semibold text-primary-foreground",
								)}
							>
								{cell.date.getUTCDate()}
							</span>
							<ul className="mt-1 space-y-0.5">
								{dayOccs.slice(0, 3).map((occ, i) => {
									const event = eventsById.get(occ.eventId);
									// Per-occurrence override wins over the series value.
									const allDay = occ.allDay ?? event?.allDay;
									const title = occ.title ?? event?.title ?? "Событие";
									const color = event
										? colorById.get(event.calendarId)
										: undefined;
									return (
										<li key={`${occ.eventId}-${occ.start}-${i}`}>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onSelectEvent(occ);
												}}
												style={
													color
														? {
																backgroundColor: `${color}1f`,
																color,
															}
														: undefined
												}
												className={cn(
													"block w-full truncate rounded px-1 py-0.5 text-left text-[11px]",
													color
														? "hover:brightness-110"
														: "bg-primary/10 text-primary hover:bg-primary/20",
												)}
											>
												{!allDay && (
													<span className="mr-1 tabular-nums">
														{formatTime(occ.start)}
													</span>
												)}
												{title}
											</button>
										</li>
									);
								})}
								{dayOccs.length > 3 && (
									<li className="px-1 text-[11px] text-muted-foreground">
										+{dayOccs.length - 3}
									</li>
								)}
							</ul>
						</button>
					);
				})}
			</div>
		</div>
	);
}
