import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/trpc/client";
import { type AgendaSection, buildAgenda } from "../../utils/buildAgenda";

interface UseAgendaResult {
	sections: AgendaSection[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/** Default agenda window: now through +30 days. */
const AGENDA_DAYS = 30;

/**
 * Upcoming-events agenda for the mobile Calendar. Queries `calendar.listOccurrences`
 * over a rolling range (the P0 agenda view; full month grid is deferred) and
 * groups the result by day via the pure {@link buildAgenda} helper.
 */
export function useAgenda(): UseAgendaResult {
	const [data, setData] = useState<{
		occurrences: { eventId: string; start: string; end: string }[];
		events: {
			id: string;
			title: string;
			location: string | null;
			allDay: boolean;
		}[];
	} | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const rangeStart = new Date();
			const rangeEnd = new Date(
				rangeStart.getTime() + AGENDA_DAYS * 24 * 60 * 60 * 1000,
			);
			const result = await apiClient.calendar.listOccurrences.query({
				rangeStart,
				rangeEnd,
			});
			setData({
				occurrences: result.occurrences,
				events: result.events.map((e) => ({
					id: e.id,
					title: e.title,
					location: e.location,
					allDay: e.allDay,
				})),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load calendar");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	const sections = useMemo(() => {
		if (!data) return [];
		return buildAgenda(data.occurrences, data.events);
	}, [data]);

	return { sections, isLoading, error, refresh };
}
