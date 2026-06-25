import { Button } from "@rox/ui/button";
import { useShouldAnimate } from "@rox/ui/motion";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Download,
	Plus,
	Upload,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import { SuiteQueryError } from "../components/SuiteQueryError";
import { SuiteScreen } from "../components/SuiteScreen";
import { AgendaView } from "./components/AgendaView/AgendaView";
import { CalendarScopePopover } from "./components/CalendarScopePopover";
import { CalendarSettingsPopover } from "./components/CalendarSettingsPopover";
import { EventDialog, type EventDialogValue } from "./components/EventDialog";
import { MonthView } from "./components/MonthView/MonthView";
import { SubscribeFeedDialog } from "./components/SubscribeFeedDialog";
import { TimeGridView } from "./components/TimeGridView/TimeGridView";
import { useCalendarActions } from "./hooks/useCalendarActions";
import type {
	CalendarColorById,
	CalendarRow,
	EventsById,
	OccurrenceItem,
} from "./types";
import { buildMonthGrid, shiftMonth } from "./utils/monthGrid";
import { addUtcDays, startOfUtcDay, startOfUtcWeek } from "./utils/timeGrid";

type CalendarViewMode = "month" | "week" | "day" | "agenda";

const VIEW_TABS: { value: CalendarViewMode; label: string }[] = [
	{ value: "month", label: "Месяц" },
	{ value: "week", label: "Неделя" },
	{ value: "day", label: "День" },
	{ value: "agenda", label: "Список" },
];

const MONTHS_RU = [
	"Январь",
	"Февраль",
	"Март",
	"Апрель",
	"Май",
	"Июнь",
	"Июль",
	"Август",
	"Сентябрь",
	"Октябрь",
	"Ноябрь",
	"Декабрь",
];

/** Default new-event window: the clicked day at 09:00–10:00 UTC. */
function defaultDayEventValue(calendarId: string, day: Date): EventDialogValue {
	const dtstart = startOfUtcDay(day);
	dtstart.setUTCHours(9, 0, 0, 0);
	const dtend = new Date(dtstart);
	dtend.setUTCHours(10, 0, 0, 0);
	return {
		calendarId,
		title: "",
		description: null,
		location: null,
		dtstart,
		dtend,
		allDay: false,
		timezone: "UTC",
		rrule: null,
	};
}

/** New-event window seeded from a clicked time slot (1h default duration). */
function defaultSlotEventValue(
	calendarId: string,
	start: Date,
): EventDialogValue {
	const dtend = new Date(start);
	dtend.setUTCHours(dtend.getUTCHours() + 1);
	return {
		calendarId,
		title: "",
		description: null,
		location: null,
		dtstart: new Date(start),
		dtend,
		allDay: false,
		timezone: "UTC",
		rrule: null,
	};
}

/** Trigger a browser download for an in-memory .ics document. */
function downloadIcs(filename: string, ics: string) {
	const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

/** RU label for the current period (month name, week span, or weekday+date). */
function periodLabel(view: CalendarViewMode, anchor: Date): string {
	if (view === "month") {
		return `${MONTHS_RU[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`;
	}
	if (view === "day") {
		return new Intl.DateTimeFormat("ru-RU", {
			timeZone: "UTC",
			weekday: "long",
			day: "numeric",
			month: "long",
		}).format(anchor);
	}
	// week: "16–22 июня" (or spanning months / years where needed).
	const weekStart = startOfUtcWeek(anchor);
	const weekEnd = addUtcDays(weekStart, 6);
	const dayFmt = new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		day: "numeric",
	});
	const monthFmt = new Intl.DateTimeFormat("ru-RU", {
		timeZone: "UTC",
		day: "numeric",
		month: "long",
	});
	const sameMonth = weekStart.getUTCMonth() === weekEnd.getUTCMonth();
	const left = sameMonth
		? dayFmt.format(weekStart)
		: monthFmt.format(weekStart);
	const right = monthFmt.format(weekEnd);
	return `${left} – ${right}`;
}

/**
 * Desktop Calendar surface (Suite P1). Ports the web month grid + EventDialog +
 * pure utils and adds the net-new Week/Day time grids, all on the same
 * `calendar.listOccurrences` range query (server-side RRULE expansion). Four
 * views (Месяц / Неделя / День / Список) share one detail/edit dialog; create
 * flows from the toolbar, an empty month cell, or an empty time slot.
 *
 * Cache-first (AGENTS.md rule 9): the last known occurrence set renders while a
 * range refetch is in flight; the skeleton only shows when there is genuinely no
 * data. View/anchor/scope are component-local state (URL-search persistence is
 * deferred — it needs the shared route's `validateSearch`, out of this folder).
 */
export function CalendarView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id ?? null;
	const animateSwitch = useShouldAnimate("decorative");
	const { updateEvent, updateOccurrence } = useCalendarActions();

	const [view, setView] = useState<CalendarViewMode>("month");
	const [anchor, setAnchor] = useState(() => new Date());
	const [selectedCalendarIds, setSelectedCalendarIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogValue, setDialogValue] = useState<EventDialogValue | null>(null);
	const importInputRef = useRef<HTMLInputElement>(null);

	const calendarsQuery = useQuery(trpc.calendar.listCalendars.queryOptions());
	const calendars: CalendarRow[] = useMemo(
		() => calendarsQuery.data ?? [],
		[calendarsQuery.data],
	);
	const firstCalendar = calendars[0] ?? null;
	const firstCalendarId = firstCalendar?.id ?? "";
	const ownsFirstCalendar =
		firstCalendar !== null &&
		currentUserId !== null &&
		firstCalendar.ownerUserId === currentUserId;
	const noCalendars = calendarsQuery.isSuccess && calendars.length === 0;

	// Per-view half-open `[rangeStart, rangeEnd)` window fed to listOccurrences.
	const monthGrid = useMemo(() => buildMonthGrid(anchor), [anchor]);
	const range = useMemo(() => {
		if (view === "month") {
			return { start: monthGrid.rangeStart, end: monthGrid.rangeEnd };
		}
		if (view === "week") {
			const start = startOfUtcWeek(anchor);
			return { start, end: addUtcDays(start, 7) };
		}
		if (view === "day") {
			const start = startOfUtcDay(anchor);
			return { start, end: addUtcDays(start, 1) };
		}
		// agenda follows the month window.
		return { start: monthGrid.rangeStart, end: monthGrid.rangeEnd };
	}, [view, anchor, monthGrid]);

	const calendarIdsInput = useMemo(
		() =>
			selectedCalendarIds.size > 0
				? Array.from(selectedCalendarIds)
				: undefined,
		[selectedCalendarIds],
	);

	const queryInput = useMemo(
		() => ({
			rangeStart: range.start,
			rangeEnd: range.end,
			...(calendarIdsInput ? { calendarIds: calendarIdsInput } : {}),
		}),
		[range, calendarIdsInput],
	);

	const occQuery = useQuery(
		trpc.calendar.listOccurrences.queryOptions(queryInput),
	);

	// The event currently open for edit drives the detailed getEvent query.
	const editingEventId = dialogValue?.eventId ?? null;
	const eventDetail = useQuery(
		trpc.calendar.getEvent.queryOptions(
			{ eventId: editingEventId ?? "" },
			{ enabled: dialogOpen && Boolean(editingEventId) },
		),
	);
	const attendees = eventDetail.data?.attendees ?? [];
	const currentUserRsvp = useMemo(() => {
		if (!currentUserId) return null;
		const mine = attendees.find((a) => a.userId === currentUserId);
		return mine?.status ?? null;
	}, [attendees, currentUserId]);

	const occurrences: OccurrenceItem[] = occQuery.data?.occurrences ?? [];
	const rawEvents = occQuery.data?.events ?? [];

	// Lookup the grids share: series defaults + owning calendar (for color tint).
	const eventsById: EventsById = useMemo(() => {
		const map: EventsById = new Map();
		for (const e of rawEvents) {
			map.set(e.id, {
				id: e.id,
				title: e.title,
				allDay: e.allDay,
				calendarId: e.calendarId,
			});
		}
		return map;
	}, [rawEvents]);

	const colorById: CalendarColorById = useMemo(() => {
		const map: CalendarColorById = new Map();
		for (const cal of calendars) {
			map.set(cal.id, cal.color ?? undefined);
		}
		return map;
	}, [calendars]);

	const hasData = occQuery.data !== undefined;
	const isEmpty = occurrences.length === 0;

	const stepAnchor = (dir: 1 | -1) => {
		setAnchor((current) => {
			if (view === "month") return shiftMonth(current, dir);
			if (view === "week") return addUtcDays(startOfUtcWeek(current), dir * 7);
			if (view === "day") return addUtcDays(startOfUtcDay(current), dir);
			return shiftMonth(current, dir);
		});
	};

	const openCreateDay = (day: Date) => {
		if (!firstCalendarId) return;
		setDialogValue(defaultDayEventValue(firstCalendarId, day));
		setDialogOpen(true);
	};

	const openCreateSlot = (start: Date) => {
		if (!firstCalendarId) return;
		setDialogValue(defaultSlotEventValue(firstCalendarId, start));
		setDialogOpen(true);
	};

	const openEdit = (occurrence: OccurrenceItem) => {
		const event = rawEvents.find((e) => e.id === occurrence.eventId);
		if (!event) return;
		const isInstance = Boolean(event.rrule);
		// HIGH fix: seed the dialog from the CLICKED instance, not the series
		// anchor. Editing "this event only" then writes THIS instance's time as the
		// override; seeding from the anchor would teleport the instance to the
		// series start even when the user never touched the time. A one-off event's
		// occurrence start/end already equal its anchor, so this is a no-op there.
		setDialogValue({
			eventId: event.id,
			calendarId: event.calendarId,
			title: occurrence.title ?? event.title,
			description: occurrence.description ?? event.description,
			location: occurrence.location ?? event.location,
			dtstart: isInstance
				? new Date(occurrence.start)
				: new Date(event.dtstart),
			dtend: isInstance ? new Date(occurrence.end) : new Date(event.dtend),
			allDay: occurrence.allDay ?? event.allDay,
			timezone: event.timezone,
			rrule: event.rrule,
			// Carry the clicked instance's RECURRENCE-ID verbatim so "this event
			// only" writes against the right slot (never recomputed client-side).
			occurrenceStart: isInstance
				? new Date(occurrence.originalStart ?? occurrence.start)
				: undefined,
		});
		setDialogOpen(true);
	};

	/**
	 * Persist a drag-MOVE or edge-RESIZE from the time grid. A one-off event
	 * writes the whole series via `updateEvent`; a recurring instance writes a
	 * "this event only" override via `updateOccurrence`, threading the clicked
	 * instance's RECURRENCE-ID (`occurrence.originalStart`) back VERBATIM so the
	 * server keys the override on the right slot (never recomputed client-side —
	 * teleport/DST-safe). Both `dtstart`/`dtend` are sent as ISO UTC.
	 */
	const persistOccurrenceTime = useCallback(
		(occurrence: OccurrenceItem, next: { start: Date; end: Date }) => {
			const event = rawEvents.find((e) => e.id === occurrence.eventId);
			if (!event) return;
			const dtstart = next.start.toISOString();
			const dtend = next.end.toISOString();
			if (event.rrule) {
				updateOccurrence.mutate({
					eventId: event.id,
					originalStart: occurrence.originalStart ?? occurrence.start,
					dtstart,
					dtend,
				});
			} else {
				updateEvent.mutate({ eventId: event.id, dtstart, dtend });
			}
		},
		[rawEvents, updateEvent, updateOccurrence],
	);

	const handleExport = async () => {
		if (!firstCalendarId) return;
		try {
			const { ics, filename } = await queryClient.fetchQuery(
				trpc.calendar.exportIcs.queryOptions({ calendarId: firstCalendarId }),
			);
			downloadIcs(filename, ics);
		} catch (error) {
			logger.error("[CalendarView] export failed", error);
		}
	};

	const toggleCalendar = (calendarId: string) => {
		setSelectedCalendarIds((prev) => {
			const next = new Set(prev);
			if (next.has(calendarId)) next.delete(calendarId);
			else next.add(calendarId);
			return next;
		});
	};

	const monthLabel = periodLabel(view, anchor);

	return (
		<SuiteScreen
			title="Календарь"
			description="Месяц · Неделя · День · Список"
			icon={CalendarDays}
			className="max-w-none"
			actions={
				<div className="flex flex-wrap items-center justify-end gap-1.5">
					<div className="flex items-center gap-1">
						<Button
							size="icon"
							variant="ghost"
							aria-label="Предыдущий период"
							onClick={() => stepAnchor(-1)}
						>
							<ChevronLeft className="size-4" />
						</Button>
						<span className="min-w-40 text-center font-medium text-sm capitalize">
							{monthLabel}
						</span>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Следующий период"
							onClick={() => stepAnchor(1)}
						>
							<ChevronRight className="size-4" />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setAnchor(new Date())}
						>
							Сегодня
						</Button>
					</div>

					<Tabs
						value={view}
						onValueChange={(v) => setView(v as CalendarViewMode)}
					>
						<TabsList>
							{VIEW_TABS.map((t) => (
								<TabsTrigger key={t.value} value={t.value}>
									{t.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>

					{calendars.length > 0 && (
						<CalendarScopePopover
							calendars={calendars}
							selected={selectedCalendarIds}
							onToggle={toggleCalendar}
							onReset={() => setSelectedCalendarIds(new Set())}
						/>
					)}

					<Button
						size="icon"
						variant="ghost"
						aria-label="Экспорт в .ics"
						title="Экспорт в .ics"
						onClick={handleExport}
						disabled={!firstCalendarId}
					>
						<Download className="size-4" />
					</Button>
					<ImportIcsButton
						calendarId={firstCalendarId}
						inputRef={importInputRef}
					/>

					{firstCalendar && (
						<CalendarSettingsPopover
							calendar={firstCalendar}
							isOwner={ownsFirstCalendar}
						/>
					)}

					{ownsFirstCalendar && firstCalendar && (
						<SubscribeFeedDialog
							calendarId={firstCalendar.id}
							feedEnabled={firstCalendar.feedEnabled}
							feedBusyOnly={firstCalendar.feedBusyOnly}
						/>
					)}

					<Button
						size="sm"
						onClick={() => openCreateDay(new Date())}
						disabled={!firstCalendarId}
					>
						<Plus className="mr-1 size-4" /> Событие
					</Button>
				</div>
			}
		>
			{occQuery.data?.truncated && (
				<div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
					Часть повторяющихся событий не уместилась в окно — список может быть
					неполным.
				</div>
			)}

			{noCalendars && <NoCalendarsCard />}

			{occQuery.isError && (
				<SuiteQueryError
					message={occQuery.error.message}
					onRetry={() => occQuery.refetch()}
				/>
			)}

			{/* Cache-first: skeleton only when there is genuinely no data yet. */}
			{!hasData && occQuery.isLoading && !noCalendars && (
				<CalendarLoading view={view} />
			)}

			{hasData && !occQuery.isError && (
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={view}
						initial={animateSwitch ? { opacity: 0, y: 6 } : false}
						animate={{ opacity: 1, y: 0 }}
						exit={animateSwitch ? { opacity: 0, y: -6 } : undefined}
						transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
					>
						{isEmpty && occQuery.isSuccess ? (
							<EmptyState />
						) : view === "month" ? (
							<MonthView
								grid={monthGrid}
								occurrences={occurrences}
								eventsById={eventsById}
								colorById={colorById}
								onSelectDay={openCreateDay}
								onSelectEvent={openEdit}
							/>
						) : view === "agenda" ? (
							<AgendaView
								occurrences={occurrences}
								eventsById={eventsById}
								colorById={colorById}
								onSelectEvent={openEdit}
							/>
						) : (
							<TimeGridView
								rangeStart={range.start}
								days={view === "week" ? 7 : 1}
								occurrences={occurrences}
								eventsById={eventsById}
								colorById={colorById}
								onCreateAt={openCreateSlot}
								onSelectEvent={openEdit}
								onMoveOccurrence={persistOccurrenceTime}
								onResizeOccurrence={persistOccurrenceTime}
							/>
						)}
					</motion.div>
				</AnimatePresence>
			)}

			{dialogValue && (
				<EventDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					calendars={calendars.map((c) => ({ id: c.id, name: c.name }))}
					initial={dialogValue}
					attendees={attendees}
					currentUserId={currentUserId}
					currentUserRsvp={currentUserRsvp}
					attendeesLoading={eventDetail.isLoading}
				/>
			)}
		</SuiteScreen>
	);
}

/** Per-view skeleton for the genuine no-data state. */
function CalendarLoading({ view }: { view: CalendarViewMode }) {
	if (view === "agenda") {
		return (
			<div className="space-y-4">
				{[0, 1, 2].map((i) => (
					<div key={i} className="space-y-2">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-14 w-full" />
					</div>
				))}
			</div>
		);
	}
	if (view === "month") {
		return <Skeleton className="h-[60dvh] w-full rounded-lg" />;
	}
	// week / day: skeleton hour rows.
	return (
		<div className="space-y-2 rounded-lg border border-border p-3">
			{SKELETON_ROWS.map((row) => (
				<Skeleton key={row} className="h-8 w-full" />
			))}
		</div>
	);
}

/** Stable keys for the week/day loading skeleton (avoids index-key churn). */
const SKELETON_ROWS = Array.from({ length: 10 }, (_, i) => `cal-skel-${i}`);

/** Empty state shared by all views (query succeeded, no events in range). */
function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-20 text-center">
			<CalendarDays className="mb-3 size-8 text-muted-foreground" />
			<span className="text-foreground text-sm">Событий нет</span>
			<span className="mt-1 max-w-sm text-muted-foreground text-xs">
				В этом периоде запланированных событий не найдено.
			</span>
		</div>
	);
}

/** Empty state + CTA when the caller has no calendars yet. */
function NoCalendarsCard() {
	const { createCalendar } = useCalendarActions();

	return (
		<div
			className={cn(
				"mb-4 flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm",
			)}
		>
			<p>У вас пока нет календарей.</p>
			<Button
				onClick={() =>
					createCalendar.mutate({ name: "Мой календарь", timezone: "UTC" })
				}
				disabled={createCalendar.isPending}
			>
				Создать календарь
			</Button>
		</div>
	);
}

/** .ics import: hidden file input + trigger button, gated on a calendar. */
function ImportIcsButton({
	calendarId,
	inputRef,
}: {
	calendarId: string;
	inputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const { importIcs } = useCalendarActions();

	const runImport = async (file: File) => {
		if (!calendarId) return;
		const ics = await file.text();
		importIcs.mutate({ calendarId, ics });
	};

	return (
		<>
			<Button
				size="icon"
				variant="ghost"
				aria-label="Импорт из .ics"
				title="Импорт из .ics"
				onClick={() => inputRef.current?.click()}
				disabled={!calendarId || importIcs.isPending}
			>
				<Upload className="size-4" />
			</Button>
			<input
				ref={inputRef}
				type="file"
				accept=".ics,text/calendar"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void runImport(file);
					e.target.value = "";
				}}
			/>
		</>
	);
}
