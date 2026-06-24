import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

/**
 * Mutation bundle for the desktop calendar surface (create/update/delete events,
 * RSVP, attendees, ICS import, create calendar, reminders, feed). Each
 * successful write invalidates the occurrence range + calendar list so the
 * cache-first views refresh; attendee/reminder writes additionally refresh the
 * single `getEvent`/`listReminders` query that backs the edit dialog.
 *
 * Ported from the web calendar's `useCalendarActions`; the only delta is the
 * tRPC client hook path (`renderer/lib/api-trpc-react` `useCloudTrpc` instead of
 * the web `@/trpc/react`). The cloud router and cache-first semantics are
 * identical (AGENTS.md rule 9).
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

	// ---- per-occurrence overrides ("this event only") --------------------
	const updateOccurrence = useMutation(
		trpc.calendar.updateOccurrence.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Событие обновлено (только это)");
			},
			onError: onError("Не удалось обновить событие"),
		}),
	);

	const cancelOccurrence = useMutation(
		trpc.calendar.cancelOccurrence.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Событие удалено (только это)");
			},
			onError: onError("Не удалось удалить событие"),
		}),
	);

	const deleteOccurrenceOverride = useMutation(
		trpc.calendar.deleteOccurrenceOverride.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Изменение этого события отменено");
			},
			onError: onError("Не удалось отменить изменение"),
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

	/** Refresh the calendar list so the feed-enabled state re-renders. */
	const invalidateCalendars = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.calendar.listCalendars.queryKey(),
		});
	}, [queryClient, trpc]);

	const enableCalendarFeed = useMutation(
		trpc.calendar.enableCalendarFeed.mutationOptions({
			onSuccess: async () => {
				await invalidateCalendars();
				toast.success("Публичная подписка включена");
			},
			onError: onError("Не удалось включить подписку"),
		}),
	);

	const disableCalendarFeed = useMutation(
		trpc.calendar.disableCalendarFeed.mutationOptions({
			onSuccess: async () => {
				await invalidateCalendars();
				toast.success("Публичная подписка отключена");
			},
			onError: onError("Не удалось отключить подписку"),
		}),
	);

	const rotateCalendarFeed = useMutation(
		trpc.calendar.rotateCalendarFeed.mutationOptions({
			onSuccess: async () => {
				await invalidateCalendars();
				toast.success("Ссылка подписки обновлена");
			},
			onError: onError("Не удалось обновить ссылку"),
		}),
	);

	/** Refresh the caller's reminder list for an event after a write. */
	const invalidateReminders = useCallback(
		async (eventId: string) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.calendar.listReminders.queryKey({ eventId }),
				}),
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

	const createReminder = useMutation(
		trpc.calendar.createReminder.mutationOptions({
			onSuccess: async (_data, variables) => {
				await invalidateReminders(variables.eventId);
				toast.success("Напоминание добавлено");
			},
			onError: onError("Не удалось добавить напоминание"),
		}),
	);

	const updateReminder = useMutation(
		trpc.calendar.updateReminder.mutationOptions({
			onSuccess: async () => {
				toast.success("Напоминание обновлено");
			},
			onError: onError("Не удалось обновить напоминание"),
		}),
	);

	const deleteReminder = useMutation(
		trpc.calendar.deleteReminder.mutationOptions({
			onSuccess: async () => {
				toast.success("Напоминание удалено");
			},
			onError: onError("Не удалось удалить напоминание"),
		}),
	);

	return {
		createCalendar,
		createEvent,
		updateEvent,
		deleteEvent,
		updateOccurrence,
		cancelOccurrence,
		deleteOccurrenceOverride,
		addAttendee,
		removeAttendee,
		rsvp,
		importIcs,
		enableCalendarFeed,
		disableCalendarFeed,
		rotateCalendarFeed,
		createReminder,
		updateReminder,
		deleteReminder,
		invalidateEvent,
		invalidateReminders,
	};
}
