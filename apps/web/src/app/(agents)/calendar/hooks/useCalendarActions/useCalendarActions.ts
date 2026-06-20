"use client";

import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * Mutation bundle for the calendar surface (create/update/delete events, RSVP,
 * create calendar). Each successful write invalidates the occurrence range +
 * calendar list so the cache-first views refresh. Centralised here to keep the
 * screen/dialog components lean (mirrors drive's useDriveActions).
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

	const rsvp = useMutation(
		trpc.calendar.rsvp.mutationOptions({
			onSuccess: async () => {
				await invalidate();
			},
			onError: onError("Не удалось обновить ответ"),
		}),
	);

	return { createCalendar, createEvent, updateEvent, deleteEvent, rsvp };
}
