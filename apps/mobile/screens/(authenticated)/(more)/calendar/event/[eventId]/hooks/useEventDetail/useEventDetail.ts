import type { CalAttendeeStatus } from "@rox/db/enums";
import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type EventDetail = RouterOutputs["calendar"]["getEvent"];

interface UseEventDetailResult {
	detail: EventDetail | null;
	isLoading: boolean;
	error: string | null;
	rsvping: boolean;
	rsvp: (status: CalAttendeeStatus) => Promise<void>;
	refresh: () => Promise<void>;
}

/**
 * Single calendar event for the detail screen: title/time/attendees plus the
 * caller's RSVP action. Plain tRPC (no Electric collection for calendar), so
 * state-managed loading mirrors the Drive/Notes hooks.
 */
export function useEventDetail(
	eventId: string | undefined,
): UseEventDetailResult {
	const [detail, setDetail] = useState<EventDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [rsvping, setRsvping] = useState(false);

	const load = useCallback(async () => {
		if (!eventId) {
			setIsLoading(false);
			return;
		}
		setError(null);
		try {
			const result = await apiClient.calendar.getEvent.query({ eventId });
			setDetail(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load event");
		} finally {
			setIsLoading(false);
		}
	}, [eventId]);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	const rsvp = useCallback(
		async (status: CalAttendeeStatus) => {
			if (!eventId) return;
			setRsvping(true);
			try {
				await apiClient.calendar.rsvp.mutate({ eventId, status });
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to RSVP");
			} finally {
				setRsvping(false);
			}
		},
		[eventId, load],
	);

	return { detail, isLoading, error, rsvping, rsvp, refresh };
}
