"use client";

import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useCalendarActions } from "../../hooks/useCalendarActions";
import { buildMonthGrid, shiftMonth } from "../../utils/monthGrid";
import { EventDialog, type EventDialogValue } from "../EventDialog";
import { AgendaView } from "./AgendaView";
import { MonthView } from "./MonthView";

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

/**
 * The calendar surface. Cache-first (AGENTS.md #9): renders the last known
 * occurrence set immediately; the skeleton only shows when there is genuinely
 * no data yet. The month view drives a `[rangeStart, rangeEnd)` occurrence
 * query that the server expands from RRULEs; the agenda view reuses the same
 * data sorted chronologically.
 */
export function CalendarScreen() {
	const trpc = useTRPC();
	const { createCalendar } = useCalendarActions();
	const [anchor, setAnchor] = useState(() => new Date());
	const [view, setView] = useState<"month" | "agenda">("month");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogValue, setDialogValue] = useState<EventDialogValue | null>(null);

	const grid = useMemo(() => buildMonthGrid(anchor), [anchor]);

	const calendars = useQuery(trpc.calendar.listCalendars.queryOptions());
	const firstCalendarId = calendars.data?.[0]?.id ?? "";

	const occurrencesQuery = useQuery(
		trpc.calendar.listOccurrences.queryOptions({
			rangeStart: grid.rangeStart,
			rangeEnd: grid.rangeEnd,
		}),
	);

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

	const openEdit = (eventId: string) => {
		const event = occurrencesQuery.data?.events.find((e) => e.id === eventId);
		if (!event) return;
		setDialogValue({
			eventId: event.id,
			calendarId: event.calendarId,
			title: event.title,
			description: event.description,
			location: event.location,
			dtstart: new Date(event.dtstart),
			dtend: new Date(event.dtend),
			allDay: event.allDay,
			timezone: event.timezone,
			rrule: event.rrule,
		});
		setDialogOpen(true);
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
