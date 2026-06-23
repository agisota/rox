import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useMonthOccurrences } from "../../hooks/useMonthOccurrences";
import { shiftMonth } from "../../utils/buildMonthGrid";
import { AgendaItemRow } from "../AgendaItemRow";
import { MonthGrid } from "../MonthGrid";

interface MonthViewProps {
	onPressEvent: (eventId: string) => void;
}

/**
 * Month-grid calendar view: a static 6×7 grid with event dots plus the agenda
 * for the selected day below it. Defaults to today's day selected. Reuses the
 * shared {@link AgendaItemRow} so day rows look identical to the agenda list.
 */
export function MonthView({ onPressEvent }: MonthViewProps) {
	const [anchor, setAnchor] = useState(() => new Date());
	const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
	const { grid, sections, isLoading, error, refresh } =
		useMonthOccurrences(anchor);
	const [refreshing, setRefreshing] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const effectiveSelected = useMemo(() => {
		if (selectedDayKey) return selectedDayKey;
		const today = grid.cells.find((c) => c.isToday);
		return today?.dayKey ?? null;
	}, [selectedDayKey, grid.cells]);

	const dayItems = useMemo(() => {
		if (!effectiveSelected) return [];
		const section = sections.find((s) => s.dayKey === effectiveSelected);
		return section?.data ?? [];
	}, [sections, effectiveSelected]);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ paddingBottom: 96 }}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
		>
			<MonthGrid
				grid={grid}
				selectedDayKey={effectiveSelected}
				onPrevMonth={() => setAnchor((a) => shiftMonth(a, -1))}
				onNextMonth={() => setAnchor((a) => shiftMonth(a, 1))}
				onSelectDay={(cell) => setSelectedDayKey(cell.dayKey)}
			/>

			{error ? (
				<View className="items-center justify-center py-10 px-6">
					<Text className="text-center text-destructive">{error}</Text>
				</View>
			) : isLoading && sections.length === 0 ? (
				<View className="gap-3 p-4">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</View>
			) : dayItems.length === 0 ? (
				<View className="items-center justify-center py-10 px-6">
					<Text className="text-center text-muted-foreground">
						No events on this day.
					</Text>
				</View>
			) : (
				<View className="pt-2">
					{dayItems.map((item) => (
						<AgendaItemRow
							key={`${item.eventId}-${item.start.getTime()}`}
							item={item}
							onPress={onPressEvent}
						/>
					))}
				</View>
			)}
		</ScrollView>
	);
}
