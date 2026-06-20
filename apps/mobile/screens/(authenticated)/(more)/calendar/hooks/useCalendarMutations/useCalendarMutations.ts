import type { RouterInputs } from "@rox/trpc";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/trpc/client";
import type { EventFormResult } from "../../utils/eventForm";

type CreateEventInput = RouterInputs["calendar"]["createEvent"];
type Attendee = NonNullable<CreateEventInput["attendees"]>[number];

interface UseCalendarMutationsResult {
	saving: boolean;
	deleting: boolean;
	error: string | null;
	/**
	 * Create an event in the caller's default (first writable) calendar. Returns
	 * the new event id, or null on failure (with `error` set).
	 */
	createEvent: (form: EventFormResult) => Promise<string | null>;
	/** Patch an existing event. Returns true on success. */
	updateEvent: (eventId: string, form: EventFormResult) => Promise<boolean>;
	/** Delete an event. Returns true on success. */
	deleteEvent: (eventId: string) => Promise<boolean>;
}

function toAttendees(emails: string[]): Attendee[] {
	return emails.map((email) => ({ kind: "email" as const, email }));
}

/**
 * Calendar write operations for the mobile event form. createEvent resolves the
 * target calendar from `calendar.listCalendars` (first writable one), matching
 * the agenda's "every readable calendar" read model. No Electric collection for
 * calendar, so this mirrors the other state-managed mutation hooks.
 */
export function useCalendarMutations(): UseCalendarMutationsResult {
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const createEvent = useCallback(async (form: EventFormResult) => {
		setSaving(true);
		setError(null);
		try {
			const calendars = await apiClient.calendar.listCalendars.query();
			const target = calendars[0];
			if (!target) {
				setError(
					"No calendar available. Create a calendar on web or desktop first.",
				);
				return null;
			}
			const created = await apiClient.calendar.createEvent.mutate({
				calendarId: target.id,
				title: form.title,
				location: form.location,
				dtstart: form.dtstart,
				dtend: form.dtend,
				allDay: form.allDay,
				attendees: toAttendees(form.attendeeEmails),
			});
			return created?.id ?? null;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create event");
			return null;
		} finally {
			setSaving(false);
		}
	}, []);

	const updateEvent = useCallback(
		async (eventId: string, form: EventFormResult) => {
			setSaving(true);
			setError(null);
			try {
				await apiClient.calendar.updateEvent.mutate({
					eventId,
					title: form.title,
					location: form.location,
					dtstart: form.dtstart,
					dtend: form.dtend,
					allDay: form.allDay,
				});
				return true;
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to update event");
				return false;
			} finally {
				setSaving(false);
			}
		},
		[],
	);

	const deleteEvent = useCallback(async (eventId: string) => {
		setDeleting(true);
		setError(null);
		try {
			await apiClient.calendar.deleteEvent.mutate({ eventId });
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete event");
			return false;
		} finally {
			setDeleting(false);
		}
	}, []);

	return { saving, deleting, error, createEvent, updateEvent, deleteEvent };
}
