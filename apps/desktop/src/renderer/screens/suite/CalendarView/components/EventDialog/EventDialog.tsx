import type { CalAttendeeStatus } from "@rox/db/schema";
import type { RouterOutputs } from "@rox/trpc";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Switch } from "@rox/ui/switch";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { useCalendarActions } from "../../hooks/useCalendarActions";
import { fromDatetimeLocal, toDatetimeLocal } from "../../utils/datetimeLocal";
import {
	presetToRrule,
	RECURRENCE_OPTIONS,
	type RecurrencePreset,
	rruleToPreset,
} from "../../utils/recurrenceOptions";

export interface EventDialogValue {
	eventId?: string;
	calendarId: string;
	title: string;
	description?: string | null;
	location?: string | null;
	dtstart: Date;
	dtend: Date;
	allDay: boolean;
	timezone: string;
	rrule: string | null;
	/**
	 * The clicked instance's RECURRENCE-ID (set only when editing a recurring
	 * event). Threaded to `updateOccurrence`/`cancelOccurrence` for "this event
	 * only" edits; undefined for one-off events or create mode.
	 */
	occurrenceStart?: Date;
	/**
	 * True when the clicked instance already carries a per-occurrence override
	 * (its fields/time diverge from the series). Gates the "вернуть к серии"
	 * action, which drops the override via `deleteOccurrenceOverride`.
	 */
	occurrenceOverridden?: boolean;
}

/** Scope of a recurring-event edit: this single instance vs the whole series. */
type EditScope = "this" | "all";

type EventAttendee = RouterOutputs["calendar"]["getEvent"]["attendees"][number];
type EventReminder = RouterOutputs["calendar"]["listReminders"][number];

/** Reminder preset presets → offsetMinutes BEFORE the occurrence start. */
const REMINDER_PRESETS: {
	value: string;
	label: string;
	offsetMinutes: number;
}[] = [
	{ value: "at-time", label: "В момент начала", offsetMinutes: 0 },
	{ value: "10m", label: "За 10 минут", offsetMinutes: 10 },
	{ value: "1h", label: "За 1 час", offsetMinutes: 60 },
	{ value: "1d", label: "За 1 день", offsetMinutes: 1440 },
];

type ReminderChannel = "in_app" | "email";

const REMINDER_CHANNEL_LABEL: Record<ReminderChannel, string> = {
	in_app: "В приложении",
	email: "Email",
};

/** Short RU description of a reminder row for the list. */
function reminderLabel(reminder: EventReminder): string {
	const channel = REMINDER_CHANNEL_LABEL[reminder.channel as ReminderChannel];
	if (reminder.triggerKind === "absolute" && reminder.absoluteFireAt) {
		return `${new Date(reminder.absoluteFireAt).toLocaleString()} · ${channel}`;
	}
	const offset = reminder.offsetMinutes ?? 0;
	const preset = REMINDER_PRESETS.find((p) => p.offsetMinutes === offset);
	const when = preset?.label ?? `За ${offset} мин`;
	return `${when} · ${channel}`;
}

interface CalendarOption {
	id: string;
	name: string;
}

interface EventDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	calendars: CalendarOption[];
	/** When set, the dialog edits this event; otherwise it creates a new one. */
	initial: EventDialogValue;
	/** Persisted attendees for the event under edit (empty while creating). */
	attendees?: EventAttendee[];
	/** Signed-in user id, used to surface "you" and the current RSVP. */
	currentUserId?: string | null;
	/** The signed-in user's RSVP on this event, when they are an attendee. */
	currentUserRsvp?: CalAttendeeStatus | null;
	/** True while the `getEvent` detail (attendees) is still loading. */
	attendeesLoading?: boolean;
}

/** RU labels + tone for each RSVP status badge. */
const ATTENDEE_STATUS: Record<
	CalAttendeeStatus,
	{ label: string; className: string }
> = {
	accepted: {
		label: "Принял",
		className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
	},
	declined: {
		label: "Отклонил",
		className: "bg-red-500/15 text-red-700 dark:text-red-400",
	},
	tentative: {
		label: "Возможно",
		className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
	},
	needs_action: {
		label: "Ожидает",
		className: "bg-muted text-muted-foreground",
	},
};

const RSVP_OPTIONS: { value: CalAttendeeStatus; label: string }[] = [
	{ value: "accepted", label: "Приду" },
	{ value: "tentative", label: "Возможно" },
	{ value: "declined", label: "Не приду" },
];

/** A staged attendee request the calendar router accepts (email or @handle). */
type AttendeeInput =
	| { kind: "email"; email: string }
	| { kind: "handle"; handle: string };

/**
 * Map a free-text attendee token to the router's attendee input. A value that
 * looks like an email is sent as `email`; anything else (with or without a
 * leading `@`) is treated as a rox `@handle` the server resolves to a userId.
 */
function toAttendeeInput(value: string): AttendeeInput {
	const v = value.trim();
	if (v.includes("@") && !v.startsWith("@")) {
		return { kind: "email", email: v.toLowerCase() };
	}
	return { kind: "handle", handle: v.replace(/^@/, "").toLowerCase() };
}

/** Display name for an attendee row (rox user "you" hint or raw email). */
function attendeeLabel(
	attendee: EventAttendee,
	currentUserId?: string | null,
): string {
	if (attendee.userId) {
		return attendee.userId === currentUserId
			? "Вы"
			: (attendee.email ?? "Участник");
	}
	return attendee.email ?? "Участник";
}

/**
 * Create/edit dialog for a calendar event. Recurrence is chosen as a preset
 * (mapped to RRULE via the shared builder) with a raw-RRULE escape hatch. In
 * create mode attendees are staged as emails and persisted with the event; in
 * edit mode the dialog manages the live attendee list (add/remove + the caller's
 * RSVP) against the existing event and can delete it outright. Email delivery is
 * deferred to P3 — this is the in-app/.ics invite path.
 *
 * Ported from the web calendar's EventDialog; the only delta is the tRPC client
 * hook path. Carries the documented teleport-bug fix verbatim: the caller seeds
 * `initial` from the CLICKED occurrence and threads `occurrenceStart`
 * (RECURRENCE-ID) back to update/cancel-occurrence unchanged.
 */
export function EventDialog({
	open,
	onOpenChange,
	calendars,
	initial,
	attendees = [],
	currentUserId,
	currentUserRsvp,
	attendeesLoading = false,
}: EventDialogProps) {
	const {
		createEvent,
		updateEvent,
		deleteEvent,
		updateOccurrence,
		cancelOccurrence,
		deleteOccurrenceOverride,
		addAttendee,
		removeAttendee,
		rsvp,
		invalidateEvent,
	} = useCalendarActions();
	const isEdit = Boolean(initial.eventId);
	// "This event only" is offered when editing a recurring instance (we have its
	// RECURRENCE-ID). Default to the whole series, matching common calendar UX.
	const isRecurringInstance =
		isEdit && Boolean(initial.rrule) && Boolean(initial.occurrenceStart);
	const [editScope, setEditScope] = useState<EditScope>("all");

	const [calendarId, setCalendarId] = useState(initial.calendarId);
	const [title, setTitle] = useState(initial.title);
	const [description, setDescription] = useState(initial.description ?? "");
	const [location, setLocation] = useState(initial.location ?? "");
	const [start, setStart] = useState(toDatetimeLocal(initial.dtstart));
	const [end, setEnd] = useState(toDatetimeLocal(initial.dtend));
	const [allDay, setAllDay] = useState(initial.allDay);
	const [preset, setPreset] = useState<RecurrencePreset>(
		rruleToPreset(initial.rrule),
	);
	const [customRrule, setCustomRrule] = useState(initial.rrule ?? "");
	const [attendeeEmail, setAttendeeEmail] = useState("");
	const [stagedAttendees, setStagedAttendees] = useState<string[]>([]);

	// Re-seed when the dialog is opened for a different event.
	useEffect(() => {
		if (!open) return;
		setCalendarId(initial.calendarId);
		setTitle(initial.title);
		setDescription(initial.description ?? "");
		setLocation(initial.location ?? "");
		setStart(toDatetimeLocal(initial.dtstart));
		setEnd(toDatetimeLocal(initial.dtend));
		setAllDay(initial.allDay);
		setPreset(rruleToPreset(initial.rrule));
		setCustomRrule(initial.rrule ?? "");
		setAttendeeEmail("");
		setStagedAttendees([]);
		setEditScope("all");
	}, [open, initial]);

	/** Stage an email or @handle locally to persist alongside a brand-new event. */
	const stageAttendee = () => {
		const value = attendeeEmail.trim().toLowerCase();
		if (value && !stagedAttendees.includes(value)) {
			setStagedAttendees((prev) => [...prev, value]);
		}
		setAttendeeEmail("");
	};

	/** Add an email or @handle attendee to the persisted event (edit mode). */
	const addLiveAttendee = () => {
		const value = attendeeEmail.trim().toLowerCase();
		if (!value || !initial.eventId) return;
		const attendee = toAttendeeInput(value);
		if (
			attendee.kind === "email" &&
			attendees.some((a) => a.email === attendee.email)
		) {
			setAttendeeEmail("");
			return;
		}
		addAttendee.mutate({ eventId: initial.eventId, attendee });
		setAttendeeEmail("");
	};

	/** Remove a persisted attendee, then refresh the event detail. */
	const removeLiveAttendee = (attendeeId: string) => {
		if (!initial.eventId) return;
		const eventId = initial.eventId;
		removeAttendee.mutate(
			{ attendeeId },
			{ onSuccess: () => void invalidateEvent(eventId) },
		);
	};

	const handleDelete = () => {
		if (!initial.eventId) return;
		// Recurring + "this event only": cancel just this instance (reversible).
		if (
			isRecurringInstance &&
			editScope === "this" &&
			initial.occurrenceStart
		) {
			if (!window.confirm("Удалить только это событие из серии?")) return;
			cancelOccurrence.mutate(
				{
					eventId: initial.eventId,
					originalStart: initial.occurrenceStart,
				},
				{ onSuccess: () => onOpenChange(false) },
			);
			return;
		}
		if (!window.confirm("Удалить это событие? Действие необратимо.")) return;
		deleteEvent.mutate(
			{ eventId: initial.eventId },
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	// Recurring instance with an existing per-occurrence override: drop the
	// override so the instance reverts to the series values. Reversible (just
	// deletes the override row); invalidates `listOccurrences` via the mutation.
	const canResetOccurrence =
		isRecurringInstance &&
		Boolean(initial.occurrenceOverridden) &&
		Boolean(initial.occurrenceStart);

	const handleResetOccurrence = () => {
		if (!initial.eventId || !initial.occurrenceStart) return;
		if (!window.confirm("Вернуть это событие к значениям серии?")) return;
		deleteOccurrenceOverride.mutate(
			{
				eventId: initial.eventId,
				originalStart: initial.occurrenceStart,
			},
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	const submit = () => {
		const dtstart = fromDatetimeLocal(start);
		const dtend = fromDatetimeLocal(end);
		if (!dtstart || !dtend || !title.trim() || !calendarId) return;
		const rrule = presetToRrule(preset, dtstart, customRrule);

		if (isEdit && initial.eventId) {
			// Recurring + "this event only": patch just this instance via an
			// override (RECURRENCE-ID). No rrule/attendees — the series is untouched.
			if (
				isRecurringInstance &&
				editScope === "this" &&
				initial.occurrenceStart
			) {
				updateOccurrence.mutate(
					{
						eventId: initial.eventId,
						originalStart: initial.occurrenceStart,
						title: title.trim(),
						description: description.trim() || null,
						location: location.trim() || null,
						dtstart,
						dtend,
						allDay,
					},
					{ onSuccess: () => onOpenChange(false) },
				);
				return;
			}
			updateEvent.mutate(
				{
					eventId: initial.eventId,
					title: title.trim(),
					description: description.trim() || null,
					location: location.trim() || null,
					dtstart,
					dtend,
					allDay,
					rrule,
				},
				{ onSuccess: () => onOpenChange(false) },
			);
			return;
		}

		createEvent.mutate(
			{
				calendarId,
				title: title.trim(),
				description: description.trim() || null,
				location: location.trim() || null,
				dtstart,
				dtend,
				allDay,
				rrule,
				attendees: stagedAttendees.map(toAttendeeInput),
			},
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	const saving =
		createEvent.isPending ||
		updateEvent.isPending ||
		updateOccurrence.isPending;
	const deleting =
		deleteEvent.isPending ||
		cancelOccurrence.isPending ||
		deleteOccurrenceOverride.isPending;
	const attendeeBusy = addAttendee.isPending || removeAttendee.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Редактировать событие" : "Новое событие"}
					</DialogTitle>
					<DialogDescription>
						Заполните детали события. Повтор задаётся правилом RRULE.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="cal-event-title">Название</Label>
						<Input
							id="cal-event-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Встреча команды"
						/>
					</div>

					{!isEdit && (
						<div className="space-y-1.5">
							<Label>Календарь</Label>
							<Select value={calendarId} onValueChange={setCalendarId}>
								<SelectTrigger>
									<SelectValue placeholder="Выберите календарь" />
								</SelectTrigger>
								<SelectContent>
									{calendars.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="cal-event-start">Начало (UTC)</Label>
							<Input
								id="cal-event-start"
								type="datetime-local"
								value={start}
								onChange={(e) => setStart(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="cal-event-end">Конец (UTC)</Label>
							<Input
								id="cal-event-end"
								type="datetime-local"
								value={end}
								onChange={(e) => setEnd(e.target.value)}
							/>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<Label htmlFor="cal-event-allday">Весь день</Label>
						<Switch
							id="cal-event-allday"
							checked={allDay}
							onCheckedChange={setAllDay}
						/>
					</div>

					<div className="space-y-1.5">
						<Label>Повтор</Label>
						<Select
							value={preset}
							onValueChange={(v) => setPreset(v as RecurrencePreset)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RECURRENCE_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{preset === "custom" && (
							<Input
								value={customRrule}
								onChange={(e) => setCustomRrule(e.target.value)}
								placeholder="FREQ=MONTHLY;BYMONTHDAY=1"
								className="font-mono text-xs"
							/>
						)}
					</div>

					{isRecurringInstance && (
						<div className="space-y-1.5">
							<Label>Область изменений</Label>
							<Select
								value={editScope}
								onValueChange={(v) => setEditScope(v as EditScope)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="this">Только это событие</SelectItem>
									<SelectItem value="all">Вся серия</SelectItem>
								</SelectContent>
							</Select>
							{editScope === "this" && (
								<p className="text-muted-foreground text-xs">
									Повтор и участники относятся ко всей серии и здесь не
									меняются.
								</p>
							)}
							{canResetOccurrence && (
								<div className="flex items-center justify-between gap-2 pt-1">
									<p className="text-muted-foreground text-xs">
										Это событие изменено относительно серии.
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="shrink-0"
										onClick={handleResetOccurrence}
										disabled={deleting || saving}
									>
										Вернуть к серии
									</Button>
								</div>
							)}
						</div>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="cal-event-location">Место</Label>
						<Input
							id="cal-event-location"
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							placeholder="Zoom / Переговорная"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="cal-event-desc">Описание</Label>
						<Textarea
							id="cal-event-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
						/>
					</div>

					{isEdit ? (
						<>
							<EditAttendees
								attendees={attendees}
								loading={attendeesLoading}
								busy={attendeeBusy}
								currentUserId={currentUserId}
								currentUserRsvp={currentUserRsvp ?? null}
								email={attendeeEmail}
								onEmailChange={setAttendeeEmail}
								onAdd={addLiveAttendee}
								onRemove={removeLiveAttendee}
								onRsvp={(status) => {
									if (initial.eventId) {
										rsvp.mutate({ eventId: initial.eventId, status });
									}
								}}
								rsvpPending={rsvp.isPending}
							/>
							{initial.eventId && <EventReminders eventId={initial.eventId} />}
						</>
					) : (
						<div className="space-y-1.5">
							<Label htmlFor="cal-event-attendee">
								Участники (email или @handle)
							</Label>
							<div className="flex gap-2">
								<Input
									id="cal-event-attendee"
									type="text"
									value={attendeeEmail}
									onChange={(e) => setAttendeeEmail(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											stageAttendee();
										}
									}}
									placeholder="guest@example.com или @alice"
								/>
								<Button
									type="button"
									variant="secondary"
									onClick={stageAttendee}
								>
									Добавить
								</Button>
							</div>
							{stagedAttendees.length > 0 && (
								<ul className="flex flex-wrap gap-2 pt-1">
									{stagedAttendees.map((email) => (
										<li
											key={email}
											className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
										>
											{email}
											<button
												type="button"
												aria-label={`Убрать ${email}`}
												onClick={() =>
													setStagedAttendees((prev) =>
														prev.filter((x) => x !== email),
													)
												}
											>
												<X className="size-3" />
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				<DialogFooter className="sm:justify-between">
					{isEdit ? (
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={deleting || saving}
						>
							Удалить
						</Button>
					) : (
						<span />
					)}
					<div className="flex gap-2">
						<Button variant="ghost" onClick={() => onOpenChange(false)}>
							Отмена
						</Button>
						<Button onClick={submit} disabled={saving || !title.trim()}>
							{isEdit ? "Сохранить" : "Создать"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface EditAttendeesProps {
	attendees: EventAttendee[];
	loading: boolean;
	busy: boolean;
	currentUserId?: string | null;
	currentUserRsvp: CalAttendeeStatus | null;
	email: string;
	onEmailChange: (value: string) => void;
	onAdd: () => void;
	onRemove: (attendeeId: string) => void;
	onRsvp: (status: CalAttendeeStatus) => void;
	rsvpPending: boolean;
}

/** Edit-mode attendee management: live list, add/remove, and the caller's RSVP. */
function EditAttendees({
	attendees,
	loading,
	busy,
	currentUserId,
	currentUserRsvp,
	email,
	onEmailChange,
	onAdd,
	onRemove,
	onRsvp,
	rsvpPending,
}: EditAttendeesProps) {
	const isAttendee = attendees.some((a) => a.userId === currentUserId);

	return (
		<div className="space-y-2 border-t pt-4">
			<Label htmlFor="cal-event-attendee">Участники</Label>

			{isAttendee && (
				<div className="flex flex-wrap items-center gap-1.5 pb-1">
					<span className="text-muted-foreground text-xs">Ваш ответ:</span>
					{RSVP_OPTIONS.map((o) => (
						<Button
							key={o.value}
							type="button"
							size="sm"
							variant={currentUserRsvp === o.value ? "default" : "outline"}
							className="h-7 px-2 text-xs"
							disabled={rsvpPending}
							onClick={() => onRsvp(o.value)}
						>
							{o.label}
						</Button>
					))}
				</div>
			)}

			{loading && attendees.length === 0 ? (
				<p className="text-muted-foreground text-xs">Загрузка участников…</p>
			) : attendees.length === 0 ? (
				<p className="text-muted-foreground text-xs">Участников пока нет.</p>
			) : (
				<ul className="space-y-1">
					{attendees.map((attendee) => {
						const status = ATTENDEE_STATUS[attendee.status];
						return (
							<li
								key={attendee.id}
								className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm"
							>
								<span className="flex min-w-0 items-center gap-2">
									<span className="truncate">
										{attendeeLabel(attendee, currentUserId)}
									</span>
									{attendee.isOrganizer && (
										<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
											Организатор
										</span>
									)}
								</span>
								<span className="flex shrink-0 items-center gap-2">
									<span
										className={cn(
											"rounded-full px-2 py-0.5 text-[10px]",
											status.className,
										)}
									>
										{status.label}
									</span>
									{!attendee.isOrganizer && (
										<button
											type="button"
											aria-label={`Убрать ${attendeeLabel(attendee, currentUserId)}`}
											className="text-muted-foreground hover:text-foreground disabled:opacity-50"
											disabled={busy}
											onClick={() => onRemove(attendee.id)}
										>
											<X className="size-3.5" />
										</button>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			)}

			<div className="flex gap-2 pt-1">
				<Input
					id="cal-event-attendee"
					type="text"
					value={email}
					onChange={(e) => onEmailChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							onAdd();
						}
					}}
					placeholder="guest@example.com или @alice"
				/>
				<Button
					type="button"
					variant="secondary"
					onClick={onAdd}
					disabled={busy || !email.trim()}
				>
					Добавить
				</Button>
			</div>
		</div>
	);
}

interface EventRemindersProps {
	eventId: string;
}

/** The trigger kind a reminder form is editing: a relative preset or an
 * absolute date-time. `"custom"` is the relative escape hatch (arbitrary
 * minutes) so any persisted offset can be edited even if it is not a preset. */
type ReminderFormTrigger = "relative" | "custom" | "absolute";

/** Draft state shared by the add row and the per-row edit form. */
interface ReminderDraft {
	channel: ReminderChannel;
	trigger: ReminderFormTrigger;
	/** Selected preset value when `trigger === "relative"`. */
	preset: string;
	/** Free-form minutes when `trigger === "custom"`. */
	offsetMinutes: string;
	/** `datetime-local` string when `trigger === "absolute"`. */
	absolute: string;
}

const EMPTY_DRAFT: ReminderDraft = {
	channel: "in_app",
	trigger: "relative",
	preset: REMINDER_PRESETS[1]?.value ?? "10m",
	offsetMinutes: "15",
	absolute: "",
};

/** Seed a draft from a persisted reminder so the edit form opens pre-filled. */
function draftFromReminder(reminder: EventReminder): ReminderDraft {
	const channel = (reminder.channel as ReminderChannel) ?? "in_app";
	if (reminder.triggerKind === "absolute" && reminder.absoluteFireAt) {
		return {
			channel,
			trigger: "absolute",
			preset: EMPTY_DRAFT.preset,
			offsetMinutes: EMPTY_DRAFT.offsetMinutes,
			absolute: toDatetimeLocal(new Date(reminder.absoluteFireAt)),
		};
	}
	const offset = reminder.offsetMinutes ?? 0;
	const preset = REMINDER_PRESETS.find((p) => p.offsetMinutes === offset);
	return {
		channel,
		trigger: preset ? "relative" : "custom",
		preset: preset?.value ?? EMPTY_DRAFT.preset,
		offsetMinutes: String(offset),
		absolute: "",
	};
}

/**
 * Resolve a draft to the `{ channel, trigger, offsetMinutes?, absoluteFireAt? }`
 * payload the router's create/update mutations accept, or `null` when the draft
 * is incomplete (e.g. absolute selected with no date). The relative branch sends
 * `absoluteFireAt: null` and the absolute branch `offsetMinutes: null` so an
 * edit that switches trigger kind clears the now-unused column.
 */
function draftToReminderInput(draft: ReminderDraft): {
	channel: ReminderChannel;
	trigger: "relative" | "absolute";
	offsetMinutes: number | null;
	absoluteFireAt: Date | null;
} | null {
	if (draft.trigger === "absolute") {
		const absoluteFireAt = fromDatetimeLocal(draft.absolute);
		if (!absoluteFireAt) return null;
		return {
			channel: draft.channel,
			trigger: "absolute",
			offsetMinutes: null,
			absoluteFireAt,
		};
	}
	let offsetMinutes: number;
	if (draft.trigger === "relative") {
		const match = REMINDER_PRESETS.find((p) => p.value === draft.preset);
		if (!match) return null;
		offsetMinutes = match.offsetMinutes;
	} else {
		const parsed = Number.parseInt(draft.offsetMinutes, 10);
		if (!Number.isFinite(parsed) || parsed < 0) return null;
		offsetMinutes = parsed;
	}
	return {
		channel: draft.channel,
		trigger: "relative",
		offsetMinutes,
		absoluteFireAt: null,
	};
}

/**
 * Edit-mode reminders block: the caller's own reminders for the event, plus an
 * add row (relative preset / arbitrary minutes / absolute date-time + channel),
 * per-row inline edit via `updateReminder`, and per-row delete. Cache-first
 * (AGENTS.md rule 9): persisted rows in `data` render immediately; `isLoading`
 * only gates the empty/loading branch when there is no data yet.
 */
function EventReminders({ eventId }: EventRemindersProps) {
	const trpc = useTRPC();
	const { createReminder, updateReminder, deleteReminder } =
		useCalendarActions();
	const remindersQuery = useQuery(
		trpc.calendar.listReminders.queryOptions({ eventId }),
	);
	const reminders = remindersQuery.data ?? [];

	const [draft, setDraft] = useState<ReminderDraft>(EMPTY_DRAFT);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState<ReminderDraft>(EMPTY_DRAFT);

	const addReminder = () => {
		const input = draftToReminderInput(draft);
		if (!input) return;
		createReminder.mutate(
			{ eventId, ...input },
			{
				onSuccess: () => {
					setDraft(EMPTY_DRAFT);
					void remindersQuery.refetch();
				},
			},
		);
	};

	const startEdit = (reminder: EventReminder) => {
		setEditingId(reminder.id);
		setEditDraft(draftFromReminder(reminder));
	};

	const saveEdit = () => {
		if (!editingId) return;
		const input = draftToReminderInput(editDraft);
		if (!input) return;
		updateReminder.mutate(
			{ reminderId: editingId, ...input },
			{
				onSuccess: () => {
					setEditingId(null);
					void remindersQuery.refetch();
				},
			},
		);
	};

	const onDelete = (reminderId: string) => {
		deleteReminder.mutate(
			{ reminderId },
			{
				onSuccess: () => {
					if (editingId === reminderId) setEditingId(null);
					void remindersQuery.refetch();
				},
			},
		);
	};

	return (
		<div className="space-y-2 border-t pt-4">
			<Label>Напоминания</Label>

			{reminders.length > 0 ? (
				<ul className="space-y-1">
					{reminders.map((reminder) =>
						editingId === reminder.id ? (
							<li key={reminder.id} className="rounded-md border p-2">
								<ReminderForm draft={editDraft} onChange={setEditDraft} />
								<div className="flex justify-end gap-2 pt-2">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setEditingId(null)}
									>
										Отмена
									</Button>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={saveEdit}
										disabled={
											updateReminder.isPending ||
											!draftToReminderInput(editDraft)
										}
									>
										Сохранить
									</Button>
								</div>
							</li>
						) : (
							<li
								key={reminder.id}
								className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm"
							>
								<span className="truncate">{reminderLabel(reminder)}</span>
								<span className="flex shrink-0 items-center gap-2">
									<button
										type="button"
										aria-label="Редактировать напоминание"
										className="text-muted-foreground hover:text-foreground disabled:opacity-50"
										disabled={updateReminder.isPending}
										onClick={() => startEdit(reminder)}
									>
										<Pencil className="size-3.5" />
									</button>
									<button
										type="button"
										aria-label="Удалить напоминание"
										className="text-muted-foreground hover:text-foreground disabled:opacity-50"
										disabled={deleteReminder.isPending}
										onClick={() => onDelete(reminder.id)}
									>
										<X className="size-3.5" />
									</button>
								</span>
							</li>
						),
					)}
				</ul>
			) : remindersQuery.isLoading ? (
				<p className="text-muted-foreground text-xs">Загрузка напоминаний…</p>
			) : (
				<p className="text-muted-foreground text-xs">Напоминаний пока нет.</p>
			)}

			<div className="space-y-2 pt-1">
				<ReminderForm draft={draft} onChange={setDraft} />
				<div className="flex justify-end">
					<Button
						type="button"
						variant="secondary"
						onClick={addReminder}
						disabled={createReminder.isPending || !draftToReminderInput(draft)}
					>
						Добавить
					</Button>
				</div>
			</div>
		</div>
	);
}

interface ReminderFormProps {
	draft: ReminderDraft;
	onChange: (draft: ReminderDraft) => void;
}

/** Shared reminder editor: trigger kind + (preset | minutes | datetime) + channel. */
function ReminderForm({ draft, onChange }: ReminderFormProps) {
	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Select
					value={draft.trigger}
					onValueChange={(v) =>
						onChange({ ...draft, trigger: v as ReminderFormTrigger })
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="relative">Относительно начала</SelectItem>
						<SelectItem value="custom">Своё смещение</SelectItem>
						<SelectItem value="absolute">Конкретное время</SelectItem>
					</SelectContent>
				</Select>

				{draft.trigger === "relative" && (
					<Select
						value={draft.preset}
						onValueChange={(v) => onChange({ ...draft, preset: v })}
					>
						<SelectTrigger className="flex-1">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{REMINDER_PRESETS.map((p) => (
								<SelectItem key={p.value} value={p.value}>
									{p.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				{draft.trigger === "custom" && (
					<Input
						type="number"
						min={0}
						className="flex-1"
						value={draft.offsetMinutes}
						onChange={(e) =>
							onChange({ ...draft, offsetMinutes: e.target.value })
						}
						placeholder="Минут до начала"
					/>
				)}

				{draft.trigger === "absolute" && (
					<Input
						type="datetime-local"
						className="flex-1"
						value={draft.absolute}
						onChange={(e) => onChange({ ...draft, absolute: e.target.value })}
					/>
				)}
			</div>

			<Select
				value={draft.channel}
				onValueChange={(v) =>
					onChange({ ...draft, channel: v as ReminderChannel })
				}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="in_app">В приложении</SelectItem>
					<SelectItem value="email">Email</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
