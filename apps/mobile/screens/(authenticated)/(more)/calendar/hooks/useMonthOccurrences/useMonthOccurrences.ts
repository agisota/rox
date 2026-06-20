import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/trpc/client";
import { type AgendaSection, buildAgenda } from "../../utils/buildAgenda";
import { buildMonthGrid, type MonthGrid } from "../../utils/buildMonthGrid";

interface OccurrenceData {
	occurrences: { eventId: string; start: string; end: string }[];
	events: {
		id: string;
		title: string;
		location: string | null;
		allDay: boolean;
	}[];
}

interface UseMonthOccurrencesResult {
	grid: MonthGrid;
	/** Agenda sections for the whole anchor month (used under the grid). */
	sections: AgendaSection[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/** Pad the visible 6-week grid window so spill-over days also show event dots. */
const GRID_PAD_DAYS = 7;

/**
 * Occurrences for the month containing `anchor`, shaped for both the month grid
 * (dots per day) and an agenda list for the month. Queries
 * `calendar.listOccurrences` over the padded month window. Plain tRPC, mirroring
 * the agenda hook's state-managed lifecycle.
 */
export function useMonthOccurrences(anchor: Date): UseMonthOccurrencesResult {
	const [data, setData] = useState<OccurrenceData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const monthStart = useMemo(
		() => new Date(anchor.getFullYear(), anchor.getMonth(), 1),
		[anchor],
	);

	const load = useCallback(async () => {
		setError(null);
		try {
			const rangeStart = new Date(monthStart);
			rangeStart.setDate(rangeStart.getDate() - GRID_PAD_DAYS);
			const rangeEnd = new Date(
				monthStart.getFullYear(),
				monthStart.getMonth() + 1,
				1,
			);
			rangeEnd.setDate(rangeEnd.getDate() + GRID_PAD_DAYS);

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
	}, [monthStart]);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	const grid = useMemo(
		() => buildMonthGrid(monthStart, data?.occurrences ?? []),
		[monthStart, data?.occurrences],
	);

	const sections = useMemo(() => {
		if (!data) return [];
		return buildAgenda(data.occurrences, data.events);
	}, [data]);

	return { grid, sections, isLoading, error, refresh };
}
