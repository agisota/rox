"use client";

import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * Mutation bundle for the calendar surface (create/update/delete events, RSVP,
 * attendees, ICS import, create calendar). Each successful write invalidates the
 * occurrence range + calendar list so the cache-first views refresh; attendee
 * writes additionally refresh the single `getEvent` query that backs the edit
 * dialog. Centralised here to keep the screen/dialog components lean (mirrors
 * drive's useDriveActions).
 */
export function useCalendarActions() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const invalidate = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.calendar.listOccurrences.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.calendar.listCalendars.queryKey(),
			}),
		]);
	}, [queryClient, trpc]);

	/**
	 * Refresh the single event the edit dialog reads plus the occurrence range.
	 * `removeAttendee` only carries an attendeeId, so the caller passes the
	 * eventId here to keep `getEvent` and the views from drifting after a change.
	 */
	const invalidateEvent = useCallback(
		async (eventId: string) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.calendar.getEvent.queryKey({ eventId }),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.calendar.listOccurrences.queryKey(),
				}),
			]);
		},
		[queryClient, trpc],
	);

	const onError = (fallback: string) => (error: { message?: string }) => {
		toast.error(error.message || fallback);
	};

	const createCalendar = useMutation(
		trpc.calendar.createCalendar.mutationOptions({
			onSuccess: invalidate,
			onError: onError("Не удалось создать календарь"),
		}),
	);

	const createEvent = useMutation(
		trpc.calendar.createEvent.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Событие создано");
			},
			onError: onError("Не удалось создать событие"),
		}),
	);

	const updateEvent = useMutation(
		trpc.calendar.updateEvent.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Событие обновлено");
			},
			onError: onError("Не удалось обновить событие"),
		}),
	);

	const deleteEvent = useMutation(
		trpc.calendar.deleteEvent.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Событие удалено");
			},
			onError: onError("Не удалось удалить событие"),
		}),
	);

	const addAttendee = useMutation(
		trpc.calendar.addAttendee.mutationOptions({
			onSuccess: async (_data, variables) => {
				await invalidateEvent(variables.eventId);
				toast.success("Участник добавлен");
			},
			onError: onError("Не удалось добавить участника"),
		}),
	);

	const removeAttendee = useMutation(
		trpc.calendar.removeAttendee.mutationOptions({
			onSuccess: async () => {
				toast.success("Участник удалён");
			},
			onError: onError("Не удалось удалить участника"),
		}),
	);

	const rsvp = useMutation(
		trpc.calendar.rsvp.mutationOptions({
			onSuccess: async () => {
				await invalidate();
			},
			onError: onError("Не удалось обновить ответ"),
		}),
	);

	const importIcs = useMutation(
		trpc.calendar.importIcs.mutationOptions({
			onSuccess: async (data) => {
				await invalidate();
				toast.success(`Импортировано событий: ${data.imported}`);
			},
			onError: onError("Не удалось импортировать .ics"),
		}),
	);

	return {
		createCalendar,
		createEvent,
		updateEvent,
		deleteEvent,
		addAttendee,
		removeAttendee,
		rsvp,
		importIcs,
		invalidateEvent,
	};
}
