import { cn } from "@rox/ui/utils";
import { type KeyboardEvent, useRef, useState } from "react";
import type {
	CalendarColorById,
	EventsById,
	OccurrenceItem,
} from "../../types";
import { isGridNavKey, nextGridIndex } from "../../utils/gridNav";
import { isoDateKey, type MonthGrid } from "../../utils/monthGrid";

/** Columns in the month grid (Mon..Sun); keep in sync with `grid-cols-7`. */
const MONTH_COLUMNS = 7;

function dayLabel(date: Date): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(date);
}

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

	// Roving focus: exactly one cell is tabbable at a time (the active index);
	// arrow keys move the active cell and we imperatively focus its DOM node.
	const [activeIndex, setActiveIndex] = useState(() => {
		const todayPos = grid.cells.findIndex((c) => c.key === today);
		if (todayPos >= 0) return todayPos;
		return grid.cells.findIndex((c) => c.inMonth);
	});
	const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const focusCell = (index: number) => {
		setActiveIndex(index);
		cellRefs.current[index]?.focus();
	};

	const handleKeyDown = (
		e: KeyboardEvent<HTMLButtonElement>,
		index: number,
		date: Date,
	) => {
		// Ignore keys bubbling from an inner event chip (it has its own handler).
		if (e.target !== e.currentTarget) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onSelectDay(date);
			return;
		}
		if (!isGridNavKey(e.key)) return;
		const next = nextGridIndex(e.key, {
			current: index,
			count: grid.cells.length,
			columns: MONTH_COLUMNS,
		});
		if (next === null || next === index) {
			e.preventDefault();
			return;
		}
		e.preventDefault();
		focusCell(next);
	};

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card/40">
			<div className="grid grid-cols-7 border-b bg-muted/50" aria-hidden="true">
				{WEEKDAYS_RU.map((d) => (
					<div
						key={d}
						className="px-2 py-1.5 text-center font-medium text-muted-foreground text-xs"
					>
						{d}
					</div>
				))}
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: a native <table> cannot host the chip-overflow day-cell layout; ARIA grid is the documented escape hatch for calendar grids. */}
			<div className="grid grid-cols-7" role="grid" aria-label="Сетка месяца">
				{grid.cells.map((cell, index) => {
					const dayOccs = byDay.get(cell.key) ?? [];
					const isActive = index === activeIndex;
					return (
						// biome-ignore lint/a11y/useSemanticElements: the gridcell is an interactive <button> by design (click/Enter opens the day); a <td> would lose native button semantics.
						<button
							type="button"
							key={cell.key}
							ref={(el) => {
								cellRefs.current[index] = el;
							}}
							role="gridcell"
							aria-label={dayLabel(cell.date)}
							aria-current={cell.key === today ? "date" : undefined}
							tabIndex={isActive ? 0 : -1}
							onClick={() => {
								setActiveIndex(index);
								onSelectDay(cell.date);
							}}
							onKeyDown={(e) => handleKeyDown(e, index, cell.date)}
							className={cn(
								"min-h-24 border-r border-b p-1 text-left align-top transition-colors hover:bg-accent/50",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
