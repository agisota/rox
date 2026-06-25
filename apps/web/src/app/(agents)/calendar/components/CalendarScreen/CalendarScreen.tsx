"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronLeft,
	ChevronRight,
	Download,
	Plus,
	Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useCalendarActions } from "../../hooks/useCalendarActions";
import { buildMonthGrid, shiftMonth } from "../../utils/monthGrid";
import { EventDialog, type EventDialogValue } from "../EventDialog";
import { AgendaView } from "./AgendaView";
import { CalendarSettingsButton } from "./components/CalendarSettingsButton";
import { SubscribeFeedButton } from "./components/SubscribeFeedButton";
import { MonthView, type OccurrenceItem } from "./MonthView";

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
function defaultEventValue(calendarId: string, day: Date): EventDialogValue {
	const dtstart = new Date(day);
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

/**
 * The calendar surface. Cache-first (AGENTS.md #9): renders the last known
 * occurrence set immediately; the skeleton only shows when there is genuinely
 * no data yet. The month view drives a `[rangeStart, rangeEnd)` occurrence
 * query that the server expands from RRULEs; the agenda view reuses the same
 * data sorted chronologically. Opening an existing event additionally pulls the
 * full event (with attendees) via `getEvent` so the edit dialog can manage RSVP.
 */
export function CalendarScreen() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { createCalendar, importIcs } = useCalendarActions();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id ?? null;

	const [anchor, setAnchor] = useState(() => new Date());
	const [view, setView] = useState<"month" | "agenda">("month");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogValue, setDialogValue] = useState<EventDialogValue | null>(null);
	const importInputRef = useRef<HTMLInputElement>(null);

	const grid = useMemo(() => buildMonthGrid(anchor), [anchor]);

	const calendars = useQuery(trpc.calendar.listCalendars.queryOptions());
	const firstCalendar = calendars.data?.[0] ?? null;
	const firstCalendarId = firstCalendar?.id ?? "";
	// Only the owner manages the public subscribe feed.
	const ownsFirstCalendar =
		firstCalendar !== null &&
		currentUserId !== null &&
		firstCalendar.ownerUserId === currentUserId;

	const occurrencesQuery = useQuery(
		trpc.calendar.listOccurrences.queryOptions({
			rangeStart: grid.rangeStart,
			rangeEnd: grid.rangeEnd,
		}),
	);

	// The event currently open for edit drives the detailed getEvent query.
	const editingEventId = dialogValue?.eventId ?? null;
	const eventDetail = useQuery(
		trpc.calendar.getEvent.queryOptions(
			{ eventId: editingEventId ?? "" },
			{ enabled: dialogOpen && Boolean(editingEventId) },
		),
	);

	// Cache-first: surface persisted attendees immediately; isLoading only gates
	// the empty/loading hint inside the dialog, never the rows themselves.
	const attendees = eventDetail.data?.attendees ?? [];
	const currentUserRsvp = useMemo(() => {
		if (!currentUserId) return null;
		const mine = attendees.find((a) => a.userId === currentUserId);
		return mine?.status ?? null;
	}, [attendees, currentUserId]);

	const eventsById = useMemo(() => {
		const map = new Map<
			string,
			{ id: string; title: string; allDay: boolean }
		>();
		for (const e of occurrencesQuery.data?.events ?? []) {
			map.set(e.id, { id: e.id, title: e.title, allDay: e.allDay });
		}
		return map;
	}, [occurrencesQuery.data]);

	const occurrences = occurrencesQuery.data?.occurrences ?? [];
	const hasData = occurrencesQuery.data !== undefined;
	const noCalendars =
		calendars.isSuccess && (calendars.data?.length ?? 0) === 0;

	const openCreate = (day: Date) => {
		if (!firstCalendarId) return;
		setDialogValue(defaultEventValue(firstCalendarId, day));
		setDialogOpen(true);
	};

	const openEdit = (occurrence: OccurrenceItem) => {
		const event = occurrencesQuery.data?.events.find(
			(e) => e.id === occurrence.eventId,
		);
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
			// Per-occurrence override wins over the series value so a re-edit shows
			// the instance's own title/description/location.
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
			// Carry the clicked instance's RECURRENCE-ID so the dialog can offer
			// "this event only" — only meaningful for a recurring series.
			occurrenceStart: isInstance
				? new Date(occurrence.originalStart ?? occurrence.start)
				: undefined,
		});
		setDialogOpen(true);
	};

	const handleExport = async () => {
		if (!firstCalendarId) return;
		try {
			const { ics, filename } = await queryClient.fetchQuery(
				trpc.calendar.exportIcs.queryOptions({ calendarId: firstCalendarId }),
			);
			downloadIcs(filename, ics);
		} catch {
			// fetchQuery rethrows the tRPC error; a failed export simply leaves the
			// calendar untouched (no toast bundle owns read queries).
		}
	};

	const handleImportFile = async (file: File) => {
		if (!firstCalendarId) return;
		const ics = await file.text();
		importIcs.mutate({ calendarId: firstCalendarId, ics });
	};

	return (
		<div className="mx-auto w-full max-w-screen-2xl flex-1 space-y-6 px-4 py-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						aria-label="Предыдущий месяц"
						onClick={() => setAnchor((a) => shiftMonth(a, -1))}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<h1 className="min-w-44 text-center font-semibold text-xl">
						{MONTHS_RU[grid.month]} {grid.year}
					</h1>
					<Button
						variant="outline"
						size="icon"
						aria-label="Следующий месяц"
						onClick={() => setAnchor((a) => shiftMonth(a, 1))}
					>
						<ChevronRight className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setAnchor(new Date())}
					>
						Сегодня
					</Button>
				</div>

				<div className="flex items-center gap-2">
					<Tabs
						value={view}
						onValueChange={(v) => setView(v as "month" | "agenda")}
					>
						<TabsList>
							<TabsTrigger value="month">Месяц</TabsTrigger>
							<TabsTrigger value="agenda">Список</TabsTrigger>
						</TabsList>
					</Tabs>
					<Button
						variant="outline"
						size="icon"
						aria-label="Экспорт в .ics"
						title="Экспорт в .ics"
						onClick={handleExport}
						disabled={!firstCalendarId}
					>
						<Download className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Импорт из .ics"
						title="Импорт из .ics"
						onClick={() => importInputRef.current?.click()}
						disabled={!firstCalendarId || importIcs.isPending}
					>
						<Upload className="size-4" />
					</Button>
					<input
						ref={importInputRef}
						type="file"
						accept=".ics,text/calendar"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) void handleImportFile(file);
							e.target.value = "";
						}}
					/>
					{firstCalendar && (
						<CalendarSettingsButton
							calendar={{
								id: firstCalendar.id,
								name: firstCalendar.name,
								color: firstCalendar.color,
								timezone: firstCalendar.timezone,
								ownerUserId: firstCalendar.ownerUserId,
							}}
							isOwner={ownsFirstCalendar}
						/>
					)}
					{ownsFirstCalendar && firstCalendar && (
						<SubscribeFeedButton
							calendarId={firstCalendar.id}
							feedEnabled={firstCalendar.feedEnabled}
							feedBusyOnly={firstCalendar.feedBusyOnly}
						/>
					)}
					<Button
						onClick={() => openCreate(new Date())}
						disabled={!firstCalendarId}
					>
						<Plus className="mr-1 size-4" /> Событие
					</Button>
				</div>
			</div>

			{noCalendars && (
				<NoCalendarsCard
					pending={createCalendar.isPending}
					onCreate={() =>
						createCalendar.mutate({ name: "Мой календарь", timezone: "UTC" })
					}
				/>
			)}

			{!hasData && occurrencesQuery.isLoading ? (
				<Skeleton className="h-[60dvh] w-full rounded-lg" />
			) : view === "month" ? (
				<MonthView
					grid={grid}
					occurrences={occurrences}
					eventsById={eventsById}
					onSelectDay={openCreate}
					onSelectEvent={openEdit}
				/>
			) : (
				<AgendaView
					occurrences={occurrences}
					eventsById={eventsById}
					onSelectEvent={openEdit}
				/>
			)}

			{dialogValue && (
				<EventDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					calendars={(calendars.data ?? []).map((c) => ({
						id: c.id,
						name: c.name,
					}))}
					initial={dialogValue}
					attendees={attendees}
					currentUserId={currentUserId}
					currentUserRsvp={currentUserRsvp}
					attendeesLoading={eventDetail.isLoading}
				/>
			)}
		</div>
	);
}

/** Empty state when the caller has no calendars yet. */
function NoCalendarsCard({
	onCreate,
	pending,
}: {
	onCreate: () => void;
	pending: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm",
			)}
		>
			<p>У вас пока нет календарей.</p>
			<Button onClick={onCreate} disabled={pending}>
				Создать календарь
			</Button>
		</div>
	);
}
