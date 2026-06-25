import { cn } from "@rox/ui/utils";
import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	CalendarColorById,
	EventsById,
	OccurrenceItem,
} from "../../types";
import { isGridNavKey, nextGridIndex } from "../../utils/gridNav";
import {
	addUtcDays,
	applyDragMove,
	applyEdgeResize,
	DAY_BODY_HEIGHT,
	type DragResult,
	HOUR_LABELS,
	MIN_BLOCK_HEIGHT,
	type PositionedBlock,
	PX_PER_MINUTE,
	packDayLanes,
	snapPxToInstant,
	startOfUtcDay,
} from "../../utils/timeGrid";

interface TimeGridViewProps {
	/** UTC midnight of the first (leftmost) day column. */
	rangeStart: Date;
	/** Number of day columns (7 for week, 1 for day). */
	days: number;
	occurrences: OccurrenceItem[];
	eventsById: EventsById;
	colorById: CalendarColorById;
	/** Create at a day+time slot (already snapped to 15 min, UTC). */
	onCreateAt: (start: Date) => void;
	/** Open the clicked occurrence in the shared EventDialog (edit). */
	onSelectEvent: (occurrence: OccurrenceItem) => void;
	/**
	 * Persist a drag-to-MOVE: the occurrence's new UTC start+end (duration kept,
	 * snapped to 15 min). The handler routes single vs series-instance writes and
	 * threads `originalStart` verbatim — see CalendarView.
	 */
	onMoveOccurrence?: (
		occurrence: OccurrenceItem,
		next: { start: Date; end: Date },
	) => void;
	/** Persist a bottom-edge resize: the occurrence's new UTC end. */
	onResizeOccurrence?: (
		occurrence: OccurrenceItem,
		next: { start: Date; end: Date },
	) => void;
}

/** Pixels the pointer must travel before a press becomes a drag (vs a click). */
const DRAG_THRESHOLD_PX = 4;

type DragMode = "move" | "resize";

interface DragState {
	mode: DragMode;
	colKey: string;
	occ: OccurrenceItem;
	dayStart: Date;
	baseStart: Date;
	baseEnd: Date;
	startClientY: number;
	/** Live snapped preview; null until the threshold is crossed. */
	preview: DragResult | null;
}

interface DayColumn {
	dayStart: Date;
	key: string;
	allDay: OccurrenceItem[];
	timed: PositionedBlock<OccurrenceItem>[];
}

const ALL_DAY_LANE_LABEL = "Весь день";

function weekdayLabel(date: Date): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		weekday: "short",
	}).format(date);
}

function occTime(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

/** Whether an occurrence renders in the all-day lane (all-day or zero-length). */
function isAllDayLike(occ: OccurrenceItem, eventsById: EventsById): boolean {
	const event = eventsById.get(occ.eventId);
	const allDay = occ.allDay ?? event?.allDay ?? false;
	if (allDay) return true;
	return new Date(occ.start).getTime() === new Date(occ.end).getTime();
}

/**
 * The NEW Week/Day time grid (no web equivalent). A sticky left time axis
 * (00–23, Victor Mono via `font-mono`) plus N day columns. All-day / zero-length
 * occurrences live in a top lane separated by a hairline; timed occurrences are
 * absolutely positioned in a 24h body and packed into side-by-side lanes when
 * they overlap (see `packDayLanes`). A `bg-primary` "now" line crosses today's
 * column, refreshed every 60s. Click an empty slot to create (snapped to 15 min);
 * click an event to edit. Range math is UTC to match the `[start,end)` window.
 */
export function TimeGridView({
	rangeStart,
	days,
	occurrences,
	eventsById,
	colorById,
	onCreateAt,
	onSelectEvent,
	onMoveOccurrence,
	onResizeOccurrence,
}: TimeGridViewProps) {
	// Re-render every 60s so the "now" indicator tracks wall-clock time.
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(id);
	}, []);

	const bodyRef = useRef<HTMLDivElement>(null);

	// Roving focus across the day columns (Left/Right step between days; Up/Down
	// are no-ops in this single-row strip). Enter/Space creates at the column's
	// start. The active column is the only tabbable one.
	const [activeCol, setActiveCol] = useState(0);
	const colRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const focusColumn = (index: number) => {
		setActiveCol(index);
		colRefs.current[index]?.focus();
	};

	// Pointer drag/resize. We keep the block mounted and translate it via local
	// preview state (no DOM teleport): window-level pointer listeners follow the
	// gesture even when the pointer leaves the block, and a movement threshold
	// distinguishes a drag from a plain click-to-edit.
	const [drag, setDrag] = useState<DragState | null>(null);
	const dragRef = useRef<DragState | null>(null);
	dragRef.current = drag;
	const draggedRef = useRef(false);

	useEffect(() => {
		if (!drag) return;

		const handleMove = (e: PointerEvent) => {
			const current = dragRef.current;
			if (!current) return;
			const deltaPx = e.clientY - current.startClientY;
			if (!draggedRef.current && Math.abs(deltaPx) < DRAG_THRESHOLD_PX) {
				return;
			}
			draggedRef.current = true;
			const next =
				current.mode === "move"
					? applyDragMove(
							current.baseStart,
							current.baseEnd,
							deltaPx,
							current.dayStart,
						)
					: applyEdgeResize(
							current.baseStart,
							current.baseEnd,
							deltaPx,
							current.dayStart,
						);
			setDrag({ ...current, preview: next });
		};

		const handleUp = () => {
			const current = dragRef.current;
			setDrag(null);
			if (!current || !current.preview) return;
			const handler =
				current.mode === "move" ? onMoveOccurrence : onResizeOccurrence;
			handler?.(current.occ, current.preview);
		};

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
		window.addEventListener("pointercancel", handleUp);
		return () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
			window.removeEventListener("pointercancel", handleUp);
		};
	}, [drag, onMoveOccurrence, onResizeOccurrence]);

	const beginDrag = (
		mode: DragMode,
		e: React.PointerEvent,
		col: DayColumn,
		block: PositionedBlock<OccurrenceItem>,
	) => {
		const handler = mode === "move" ? onMoveOccurrence : onResizeOccurrence;
		if (!handler) return;
		e.stopPropagation();
		e.preventDefault();
		draggedRef.current = false;
		setDrag({
			mode,
			colKey: col.key,
			occ: block.item,
			dayStart: col.dayStart,
			baseStart: block.start,
			baseEnd: block.end,
			startClientY: e.clientY,
			preview: null,
		});
	};

	const columns = useMemo<DayColumn[]>(() => {
		const base = startOfUtcDay(rangeStart);
		const result: DayColumn[] = [];
		for (let i = 0; i < days; i++) {
			const dayStart = addUtcDays(base, i);
			const dayEnd = addUtcDays(dayStart, 1);
			const dayStartMs = dayStart.getTime();
			const dayEndMs = dayEnd.getTime();

			const allDay: OccurrenceItem[] = [];
			const timedRaw: { item: OccurrenceItem; start: Date; end: Date }[] = [];

			for (const occ of occurrences) {
				const start = new Date(occ.start);
				const end = new Date(occ.end);
				// Half-open membership: the occurrence touches this day if it starts
				// before the day ends and ends after the day starts.
				if (start.getTime() >= dayEndMs || end.getTime() <= dayStartMs) {
					continue;
				}
				if (isAllDayLike(occ, eventsById)) {
					allDay.push(occ);
				} else {
					// Clamp to the day so a multi-hour event that spills a boundary
					// still positions inside this column.
					const clampedStart = start.getTime() < dayStartMs ? dayStart : start;
					const clampedEnd = end.getTime() > dayEndMs ? dayEnd : end;
					timedRaw.push({
						item: occ,
						start: clampedStart,
						end: clampedEnd,
					});
				}
			}

			result.push({
				dayStart,
				key: dayStart.toISOString().slice(0, 10),
				allDay,
				timed: packDayLanes(timedRaw, dayStart),
			});
		}
		return result;
	}, [rangeStart, days, occurrences, eventsById]);

	const hasAllDay = columns.some((c) => c.allDay.length > 0);
	const todayDayStart = startOfUtcDay(now).getTime();
	const nowMinutes = (now.getTime() - todayDayStart) / 60000;
	const nowTop = nowMinutes * PX_PER_MINUTE;

	const handleSlotClick = (
		event: React.MouseEvent<HTMLButtonElement>,
		dayStart: Date,
	) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const offsetY = event.clientY - rect.top;
		onCreateAt(snapPxToInstant(offsetY, dayStart));
	};

	const handleColumnKeyDown = (
		e: KeyboardEvent<HTMLButtonElement>,
		index: number,
		dayStart: Date,
	) => {
		// Only react to keys aimed at the column itself, not ones bubbling up from
		// a focused event block (which owns its own Enter/click handling).
		if (e.target !== e.currentTarget) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			// Keyboard create has no pointer Y, so anchor at the column's start.
			onCreateAt(startOfUtcDay(dayStart));
			return;
		}
		if (!isGridNavKey(e.key)) return;
		const next = nextGridIndex(e.key, {
			current: index,
			count: columns.length,
			columns: columns.length,
		});
		e.preventDefault();
		if (next === null || next === index) return;
		focusColumn(next);
	};

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card/40">
			{/* Header row: empty time-axis gutter + day headers */}
			<div
				className="grid border-b bg-muted/40"
				style={{
					gridTemplateColumns: `4rem repeat(${days}, minmax(0, 1fr))`,
				}}
			>
				<div className="border-r" />
				{columns.map((col) => {
					const isToday = col.dayStart.getTime() === todayDayStart;
					return (
						<div
							key={col.key}
							className={cn(
								"border-r px-2 py-1.5 text-center last:border-r-0",
								isToday && "bg-primary/10",
							)}
						>
							<div className="font-medium text-muted-foreground text-xs capitalize">
								{weekdayLabel(col.dayStart)}
							</div>
							<div
								className={cn(
									"mx-auto mt-0.5 inline-flex size-6 items-center justify-center rounded-full font-mono text-sm tabular-nums",
									isToday && "bg-primary font-semibold text-primary-foreground",
								)}
							>
								{col.dayStart.getUTCDate()}
							</div>
						</div>
					);
				})}
			</div>

			{/* All-day lane (only when something lands in it) */}
			{hasAllDay && (
				<div
					className="grid border-b"
					style={{
						gridTemplateColumns: `4rem repeat(${days}, minmax(0, 1fr))`,
					}}
				>
					<div className="flex items-center justify-end border-r px-2 py-1 text-[10px] text-muted-foreground">
						{ALL_DAY_LANE_LABEL}
					</div>
					{columns.map((col) => (
						<div
							key={col.key}
							className="space-y-0.5 border-r p-1 last:border-r-0"
						>
							{col.allDay.map((occ, i) => {
								const ev = eventsById.get(occ.eventId);
								const title = occ.title ?? ev?.title ?? "Событие";
								const color = ev ? colorById.get(ev.calendarId) : undefined;
								return (
									<button
										key={`${occ.eventId}-${occ.start}-${i}`}
										type="button"
										onClick={() => onSelectEvent(occ)}
										style={
											color
												? { backgroundColor: `${color}1f`, color }
												: undefined
										}
										className={cn(
											"block w-full truncate rounded px-1 py-0.5 text-left text-[11px]",
											color
												? "hover:brightness-110"
												: "bg-primary/10 text-primary hover:bg-primary/20",
										)}
									>
										{title}
									</button>
								);
							})}
						</div>
					))}
				</div>
			)}

			{/* Scrollable timed body */}
			{/* biome-ignore lint/a11y/useSemanticElements: the absolute-positioned time-axis layout cannot be a native <table>; ARIA grid is the documented escape hatch for time grids. */}
			<div
				ref={bodyRef}
				className="grid max-h-[60dvh] overflow-y-auto"
				style={{
					gridTemplateColumns: `4rem repeat(${days}, minmax(0, 1fr))`,
				}}
				role="grid"
				aria-label={days > 1 ? "Сетка недели" : "Сетка дня"}
			>
				{/* Time axis */}
				<div className="relative border-r" style={{ height: DAY_BODY_HEIGHT }}>
					{HOUR_LABELS.map((label, h) => (
						<div
							key={label}
							className="absolute right-1 font-mono text-[10px] text-muted-foreground tabular-nums"
							style={{ top: h * 60 * PX_PER_MINUTE - 6 }}
						>
							{h === 0 ? "" : label}
						</div>
					))}
				</div>

				{/* Day columns */}
				{columns.map((col, colIndex) => {
					const isToday = col.dayStart.getTime() === todayDayStart;
					const isActiveCol =
						colIndex === Math.min(activeCol, columns.length - 1);
					return (
						// biome-ignore lint/a11y/useSemanticElements: the column is an interactive <button> by design (click/Enter creates an event); a <td> would lose native button semantics.
						<button
							key={col.key}
							type="button"
							ref={(el) => {
								colRefs.current[colIndex] = el;
							}}
							role="gridcell"
							tabIndex={isActiveCol ? 0 : -1}
							onClick={(e) => {
								setActiveCol(colIndex);
								handleSlotClick(e, col.dayStart);
							}}
							onKeyDown={(e) => handleColumnKeyDown(e, colIndex, col.dayStart)}
							className={cn(
								"relative block border-r p-0 text-left last:border-r-0 hover:bg-accent/20",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
							)}
							style={{ height: DAY_BODY_HEIGHT }}
							aria-label={`Создать событие — ${col.key}`}
						>
							{/* Hour gridlines */}
							{HOUR_LABELS.map((label, h) =>
								h === 0 ? null : (
									<div
										key={label}
										className="pointer-events-none absolute inset-x-0 border-border/50 border-t"
										style={{ top: h * 60 * PX_PER_MINUTE }}
									/>
								),
							)}

							{/* Now indicator */}
							{isToday && nowMinutes >= 0 && nowMinutes <= 1440 && (
								<div
									className="pointer-events-none absolute inset-x-0 z-10 border-primary border-t-2"
									style={{ top: nowTop }}
								>
									<span className="-left-1 -top-1 absolute size-2 rounded-full bg-primary" />
								</div>
							)}

							{/* Timed event blocks */}
							{col.timed.map((block, i) => {
								const occ = block.item;
								const ev = eventsById.get(occ.eventId);
								const title = occ.title ?? ev?.title ?? "Событие";
								const color = ev ? colorById.get(ev.calendarId) : undefined;
								const widthPct = 100 / block.laneCount;
								const leftPct = widthPct * block.lane;
								const canDrag = Boolean(onMoveOccurrence);
								const canResize = Boolean(onResizeOccurrence);

								// While this block is the active gesture target, render its
								// live snapped preview (top/height) instead of its packed
								// position so it follows the pointer without a DOM teleport.
								const active =
									drag?.colKey === col.key &&
									drag.occ.eventId === occ.eventId &&
									drag.occ.start === occ.start &&
									drag.preview !== null
										? drag
										: null;
								let top = block.top;
								let height = block.height;
								let startLabel = occ.start;
								if (active?.preview) {
									const previewTopMin =
										(active.preview.start.getTime() - col.dayStart.getTime()) /
										60_000;
									const previewMin =
										(active.preview.end.getTime() -
											active.preview.start.getTime()) /
										60_000;
									top = previewTopMin * PX_PER_MINUTE;
									height = Math.max(
										previewMin * PX_PER_MINUTE,
										MIN_BLOCK_HEIGHT,
									);
									startLabel = active.preview.start.toISOString();
								}

								return (
									// Positioned wrapper so the edit button and the resize handle
									// are SIBLINGS (no nested interactive elements / invalid HTML).
									<div
										key={`${occ.eventId}-${occ.start}-${i}`}
										style={{
											top,
											height,
											left: `calc(${leftPct}% + 2px)`,
											width: `calc(${widthPct}% - 4px)`,
										}}
										className={cn("absolute z-[5]", active && "z-20")}
									>
										<button
											type="button"
											onPointerDown={
												canDrag
													? (e) => beginDrag("move", e, col, block)
													: undefined
											}
											onClick={(e) => {
												e.stopPropagation();
												// Suppress the click that ends a drag so a move/resize
												// doesn't also open the edit dialog.
												if (draggedRef.current) {
													draggedRef.current = false;
													return;
												}
												onSelectEvent(occ);
											}}
											style={
												color
													? {
															backgroundColor: `${color}26`,
															borderColor: color,
															color,
														}
													: undefined
											}
											className={cn(
												"block size-full overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight",
												canDrag && "cursor-grab active:cursor-grabbing",
												active && "opacity-90 shadow-lg",
												color
													? "hover:brightness-110"
													: "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25",
											)}
										>
											<span className="block font-mono tabular-nums opacity-80">
												{occTime(startLabel)}
											</span>
											<span className="block truncate font-medium">
												{title}
											</span>
										</button>
										{canResize && (
											<button
												type="button"
												aria-label="Изменить время окончания"
												onPointerDown={(e) =>
													beginDrag("resize", e, col, block)
												}
												onClick={(e) => e.stopPropagation()}
												className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize"
											/>
										)}
									</div>
								);
							})}
						</button>
					);
				})}
			</div>
		</div>
	);
}
