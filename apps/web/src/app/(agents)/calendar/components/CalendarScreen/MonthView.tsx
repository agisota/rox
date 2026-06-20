"use client";

import { cn } from "@rox/ui/utils";
import { isoDateKey, type MonthGrid } from "../../utils/monthGrid";

const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export interface OccurrenceItem {
	eventId: string;
	start: string;
	end: string;
}

interface MonthViewProps {
	grid: MonthGrid;
	occurrences: OccurrenceItem[];
	eventsById: Map<string, { id: string; title: string; allDay: boolean }>;
	onSelectDay: (day: Date) => void;
	onSelectEvent: (eventId: string) => void;
}

const todayKey = () => isoDateKey(new Date());

function formatTime(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

/** The 6×7 month grid with each day's occurrence chips. */
export function MonthView({
	grid,
	occurrences,
	eventsById,
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
		<div className="overflow-hidden rounded-lg border">
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
									"inline-flex size-6 items-center justify-center rounded-full text-xs",
									cell.key === today &&
										"bg-primary font-semibold text-primary-foreground",
								)}
							>
								{cell.date.getUTCDate()}
							</span>
							<ul className="mt-1 space-y-0.5">
								{dayOccs.slice(0, 3).map((occ, i) => {
									const event = eventsById.get(occ.eventId);
									return (
										<li key={`${occ.eventId}-${occ.start}-${i}`}>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onSelectEvent(occ.eventId);
												}}
												className="block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-[11px] text-primary hover:bg-primary/20"
											>
												{!event?.allDay && (
													<span className="mr-1 tabular-nums">
														{formatTime(occ.start)}
													</span>
												)}
												{event?.title ?? "Событие"}
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
