import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Clock,
	MapPin,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import { SuiteQueryError } from "../components/SuiteQueryError";
import { SuiteScreen } from "../components/SuiteScreen";
import { addMonths, dayKey, monthRange } from "../utils/monthRange";
import { SubscribeFeedDialog } from "./components/SubscribeFeedDialog";

type RsvpStatus = "needs_action" | "accepted" | "declined" | "tentative";

const RSVP_OPTIONS: { status: RsvpStatus; label: string }[] = [
	{ status: "accepted", label: "Принять" },
	{ status: "tentative", label: "Возможно" },
	{ status: "declined", label: "Отклонить" },
];

/** Reminder presets → minutes BEFORE the occurrence start (C6). */
const REMINDER_PRESETS: { label: string; offsetMinutes: number }[] = [
	{ label: "В момент", offsetMinutes: 0 },
	{ label: "За 10 мин", offsetMinutes: 10 },
	{ label: "За 1 час", offsetMinutes: 60 },
	{ label: "За 1 день", offsetMinutes: 1440 },
];

function reminderOffsetLabel(offsetMinutes: number | null): string {
	const offset = offsetMinutes ?? 0;
	return (
		REMINDER_PRESETS.find((p) => p.offsetMinutes === offset)?.label ??
		`За ${offset} мин`
	);
}

interface AgendaItem {
	key: string;
	eventId: string;
	start: Date;
	end: Date;
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDayHeading(date: Date): string {
	return date.toLocaleDateString([], {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

/**
 * Calendar agenda (Suite P0). Reads `calendar.listOccurrences` for the visible
 * month, groups expanded occurrences by local day, and opens an event detail
 * dialog with RSVP actions (`calendar.rsvp`). Month navigation re-queries the
 * range. Recurrence expansion + org scoping happen server-side; the view never
 * materialises recurrences itself.
 *
 * Cache-first (AGENTS.md rule 9): occurrences already in cache render while a
 * month re-fetch is in flight.
 */
export function CalendarView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id ?? null;

	const [anchor, setAnchor] = useState(() => new Date());
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

	// The public subscribe feed is owner-managed; load the calendar list to gate
	// the control on ownership and read the feed state.
	const calendarsQuery = useQuery(trpc.calendar.listCalendars.queryOptions());
	const firstCalendar = calendarsQuery.data?.[0] ?? null;
	const ownsFirstCalendar =
		firstCalendar !== null &&
		currentUserId !== null &&
		firstCalendar.ownerUserId === currentUserId;

	const range = useMemo(() => monthRange(anchor), [anchor]);
	const queryInput = useMemo(
		() => ({ rangeStart: range.start, rangeEnd: range.end }),
		[range],
	);

	const occQuery = useQuery(
		trpc.calendar.listOccurrences.queryOptions(queryInput),
	);

	const rsvp = useMutation(
		trpc.calendar.rsvp.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.calendar.listOccurrences.queryKey(queryInput),
				});
				toast.success("Ответ сохранён");
				setSelectedEventId(null);
			},
			onError: (error) => {
				logger.error("[CalendarView] rsvp failed", error);
				toast.error("Не удалось сохранить ответ");
			},
		}),
	);

	const occurrences = occQuery.data?.occurrences ?? [];
	const events = occQuery.data?.events ?? [];
	const eventsById = useMemo(
		() => new Map(events.map((event) => [event.id, event])),
		[events],
	);

	const grouped = useMemo(() => {
		const byDay = new Map<string, AgendaItem[]>();
		for (const occ of occurrences) {
			const start = new Date(occ.start);
			const item: AgendaItem = {
				key: `${occ.eventId}-${occ.start}`,
				eventId: occ.eventId,
				start,
				end: new Date(occ.end),
			};
			const key = dayKey(start);
			const list = byDay.get(key);
			if (list) list.push(item);
			else byDay.set(key, [item]);
		}
		return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
	}, [occurrences]);

	const selectedEvent = selectedEventId
		? (eventsById.get(selectedEventId) ?? null)
		: null;
	const monthLabel = anchor.toLocaleDateString([], {
		month: "long",
		year: "numeric",
	});
	const isEmpty = occurrences.length === 0;

	return (
		<SuiteScreen
			title="Календарь"
			description="Повестка событий по месяцам, RSVP"
			icon={CalendarDays}
			actions={
				<div className="flex items-center gap-1">
					{ownsFirstCalendar && firstCalendar && (
						<SubscribeFeedDialog
							calendarId={firstCalendar.id}
							feedEnabled={firstCalendar.feedEnabled}
							feedBusyOnly={firstCalendar.feedBusyOnly}
						/>
					)}
					<Button
						size="icon"
						variant="ghost"
						aria-label="Предыдущий месяц"
						onClick={() => setAnchor((d) => addMonths(d, -1))}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<span className="min-w-36 text-center font-medium text-sm capitalize">
						{monthLabel}
					</span>
					<Button
						size="icon"
						variant="ghost"
						aria-label="Следующий месяц"
						onClick={() => setAnchor((d) => addMonths(d, 1))}
					>
						<ChevronRight className="size-4" />
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

			{occQuery.isError && (
				<SuiteQueryError
					message={occQuery.error.message}
					onRetry={() => occQuery.refetch()}
				/>
			)}

			{isEmpty && occQuery.isLoading && (
				<div className="space-y-4">
					{[0, 1, 2].map((i) => (
						<div key={i} className="space-y-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-14 w-full" />
						</div>
					))}
				</div>
			)}

			{isEmpty && occQuery.isSuccess && (
				<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-20 text-center">
					<CalendarDays className="mb-3 size-8 text-muted-foreground" />
					<span className="text-foreground text-sm">Событий нет</span>
					<span className="mt-1 max-w-sm text-muted-foreground text-xs">
						В этом месяце запланированных событий не найдено.
					</span>
				</div>
			)}

			{!isEmpty && (
				<div className="space-y-6">
					{grouped.map(([key, items]) => (
						<div key={key}>
							<h2 className="mb-2 font-medium text-muted-foreground text-sm capitalize">
								{formatDayHeading(items[0]?.start ?? new Date())}
							</h2>
							<div className="space-y-1.5">
								{items.map((item) => {
									const event = eventsById.get(item.eventId);
									return (
										<button
											key={item.key}
											type="button"
											onClick={() => setSelectedEventId(item.eventId)}
											className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50"
										>
											<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
												{event?.allDay ? "весь день" : formatTime(item.start)}
											</span>
											<span className="min-w-0 flex-1 truncate text-sm">
												{event?.title ?? "Событие"}
											</span>
											{event?.location && (
												<span className="hidden shrink-0 items-center gap-1 text-muted-foreground text-xs sm:flex">
													<MapPin className="size-3" />
													<span className="max-w-32 truncate">
														{event.location}
													</span>
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Event detail + RSVP dialog */}
			<Dialog
				open={selectedEvent !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedEventId(null);
				}}
			>
				<DialogContent>
					{selectedEvent && (
						<>
							<DialogHeader>
								<DialogTitle className="cursor-text select-text">
									{selectedEvent.title}
								</DialogTitle>
								{selectedEvent.description && (
									<DialogDescription className="cursor-text select-text whitespace-pre-wrap">
										{selectedEvent.description}
									</DialogDescription>
								)}
							</DialogHeader>
							<dl className="space-y-2 text-sm">
								<div className="flex items-center gap-2 text-muted-foreground">
									<Clock className="size-4 shrink-0" />
									<span>
										{new Date(selectedEvent.dtstart).toLocaleString([], {
											dateStyle: "medium",
											timeStyle: selectedEvent.allDay ? undefined : "short",
										})}
										{" — "}
										{new Date(selectedEvent.dtend).toLocaleString([], {
											dateStyle: "medium",
											timeStyle: selectedEvent.allDay ? undefined : "short",
										})}
									</span>
								</div>
								{selectedEvent.location && (
									<div className="flex items-center gap-2 text-muted-foreground">
										<MapPin className="size-4 shrink-0" />
										<span className="cursor-text select-text">
											{selectedEvent.location}
										</span>
									</div>
								)}
								{selectedEvent.rrule && (
									<Badge variant="outline" className="text-[10px]">
										повторяющееся
									</Badge>
								)}
							</dl>
							<div className="flex flex-wrap gap-2 pt-2">
								{RSVP_OPTIONS.map((option) => (
									<Button
										key={option.status}
										size="sm"
										variant={
											option.status === "accepted" ? "default" : "outline"
										}
										disabled={rsvp.isPending}
										onClick={() =>
											rsvp.mutate({
												eventId: selectedEvent.id,
												status: option.status,
											})
										}
										className={cn(
											option.status === "declined" &&
												"text-destructive hover:text-destructive",
										)}
									>
										{option.label}
									</Button>
								))}
							</div>

							<EventReminders eventId={selectedEvent.id} />
						</>
					)}
				</DialogContent>
			</Dialog>
		</SuiteScreen>
	);
}

interface EventRemindersProps {
	eventId: string;
}

/**
 * C6 reminders surface for the desktop event detail (read + RSVP screen has no
 * full editor). Shows the caller's own reminders for the event with add-preset +
 * delete via `calendar.createReminder`/`deleteReminder`. Cache-first (AGENTS.md
 * rule 9): persisted rows render immediately; loading only gates the empty
 * branch.
 */
function EventReminders({ eventId }: EventRemindersProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const remindersQuery = useQuery(
		trpc.calendar.listReminders.queryOptions({ eventId }),
	);
	const reminders = remindersQuery.data ?? [];

	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.calendar.listReminders.queryKey({ eventId }),
		});
	};

	const createReminder = useMutation(
		trpc.calendar.createReminder.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Напоминание добавлено");
			},
			onError: (error) => {
				logger.error("[CalendarView] createReminder failed", error);
				toast.error("Не удалось добавить напоминание");
			},
		}),
	);

	const deleteReminder = useMutation(
		trpc.calendar.deleteReminder.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Напоминание удалено");
			},
			onError: (error) => {
				logger.error("[CalendarView] deleteReminder failed", error);
				toast.error("Не удалось удалить напоминание");
			},
		}),
	);

	return (
		<div className="space-y-2 border-t pt-3">
			<span className="font-medium text-muted-foreground text-xs">
				Напоминания
			</span>

			{reminders.length > 0 ? (
				<ul className="space-y-1">
					{reminders.map((reminder) => (
						<li
							key={reminder.id}
							className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm"
						>
							<span className="cursor-text select-text truncate">
								{reminderOffsetLabel(reminder.offsetMinutes)}
								{reminder.channel === "email" ? " · Email" : " · В приложении"}
							</span>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-destructive text-xs hover:text-destructive"
								disabled={deleteReminder.isPending}
								onClick={() =>
									deleteReminder.mutate({ reminderId: reminder.id })
								}
							>
								Удалить
							</Button>
						</li>
					))}
				</ul>
			) : remindersQuery.isLoading ? (
				<span className="text-muted-foreground text-xs">Загрузка…</span>
			) : (
				<span className="text-muted-foreground text-xs">
					Напоминаний пока нет.
				</span>
			)}

			<div className="flex flex-wrap gap-1.5 pt-1">
				{REMINDER_PRESETS.map((preset) => (
					<Button
						key={preset.offsetMinutes}
						size="sm"
						variant="outline"
						className="h-7 px-2 text-xs"
						disabled={createReminder.isPending}
						onClick={() =>
							createReminder.mutate({
								eventId,
								channel: "in_app",
								trigger: "relative",
								offsetMinutes: preset.offsetMinutes,
							})
						}
					>
						+ {preset.label}
					</Button>
				))}
			</div>
		</div>
	);
}
