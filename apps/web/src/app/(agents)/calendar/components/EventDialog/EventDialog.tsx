"use client";

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
import { X } from "lucide-react";
import { useEffect, useState } from "react";
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
}

/**
 * Create/edit dialog for a calendar event. Recurrence is chosen as a preset
 * (mapped to RRULE via the shared builder) with a raw-RRULE escape hatch;
 * attendees are added as emails before save (the in-app/.ics invite path — email
 * delivery is deferred to P3). On submit it calls the create or update mutation.
 */
export function EventDialog({
	open,
	onOpenChange,
	calendars,
	initial,
}: EventDialogProps) {
	const { createEvent, updateEvent } = useCalendarActions();
	const isEdit = Boolean(initial.eventId);

	const [calendarId, setCalendarId] = useState(initial.calendarId);
	const [title, setTitle] = useState(initial.title);
	const [description, setDescription] = useState(initial.description ?? "");
	const [location, setLocation] = useState(initial.location ?? "");
	const [start, setStart] = useState(toDatetimeLocal(initial.dtstart));
	const [end, setEnd] = useState(toDatetimeLocal(initial.dtend));
	const [allDay, setAllDay] = useState(initial.allDay);
	const [timezone, setTimezone] = useState(initial.timezone);
	const [preset, setPreset] = useState<RecurrencePreset>(
		rruleToPreset(initial.rrule),
	);
	const [customRrule, setCustomRrule] = useState(initial.rrule ?? "");
	const [attendeeEmail, setAttendeeEmail] = useState("");
	const [attendees, setAttendees] = useState<string[]>([]);

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
		setTimezone(initial.timezone);
		setPreset(rruleToPreset(initial.rrule));
		setCustomRrule(initial.rrule ?? "");
		setAttendeeEmail("");
		setAttendees([]);
	}, [open, initial]);

	const addAttendee = () => {
		const value = attendeeEmail.trim().toLowerCase();
		if (value && !attendees.includes(value)) {
			setAttendees((prev) => [...prev, value]);
		}
		setAttendeeEmail("");
	};

	const submit = () => {
		const dtstart = fromDatetimeLocal(start);
		const dtend = fromDatetimeLocal(end);
		if (!dtstart || !dtend || !title.trim() || !calendarId) return;
		const rrule = presetToRrule(preset, dtstart, customRrule);

		if (isEdit && initial.eventId) {
			updateEvent.mutate(
				{
					eventId: initial.eventId,
					title: title.trim(),
					description: description.trim() || null,
					location: location.trim() || null,
					dtstart,
					dtend,
					allDay,
					timezone,
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
				timezone,
				rrule,
				attendees: attendees.map((email) => ({
					kind: "email" as const,
					email,
				})),
			},
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	const pending = createEvent.isPending || updateEvent.isPending;

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
						<Label htmlFor="cal-event-tz">Часовой пояс</Label>
						<Input
							id="cal-event-tz"
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							placeholder="UTC"
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

					{!isEdit && (
						<div className="space-y-1.5">
							<Label htmlFor="cal-event-attendee">Участники (email)</Label>
							<div className="flex gap-2">
								<Input
									id="cal-event-attendee"
									type="email"
									value={attendeeEmail}
									onChange={(e) => setAttendeeEmail(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addAttendee();
										}
									}}
									placeholder="guest@example.com"
								/>
								<Button type="button" variant="secondary" onClick={addAttendee}>
									Добавить
								</Button>
							</div>
							{attendees.length > 0 && (
								<ul className="flex flex-wrap gap-2 pt-1">
									{attendees.map((email) => (
										<li
											key={email}
											className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
										>
											{email}
											<button
												type="button"
												aria-label={`Убрать ${email}`}
												onClick={() =>
													setAttendees((prev) =>
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

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Отмена
					</Button>
					<Button onClick={submit} disabled={pending || !title.trim()}>
						{isEdit ? "Сохранить" : "Создать"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
