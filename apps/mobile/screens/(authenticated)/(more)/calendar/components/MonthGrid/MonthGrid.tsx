import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	MonthCell,
	MonthGrid as MonthGridData,
} from "../../utils/buildMonthGrid";

const WEEKDAYS = [
	{ key: "sun", label: "S" },
	{ key: "mon", label: "M" },
	{ key: "tue", label: "T" },
	{ key: "wed", label: "W" },
	{ key: "thu", label: "T" },
	{ key: "fri", label: "F" },
	{ key: "sat", label: "S" },
];

interface MonthGridProps {
	grid: MonthGridData;
	selectedDayKey: string | null;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	onSelectDay: (cell: MonthCell) => void;
}

/**
 * Static month-grid view for the Calendar. Renders the pure 6×7 matrix from
 * {@link buildMonthGrid}, dims spill-over days, rings today, marks days with
 * events via a dot, and highlights the selected day. Navigation + selection are
 * delegated upward; this component holds no data state.
 */
export function MonthGrid({
	grid,
	selectedDayKey,
	onPrevMonth,
	onNextMonth,
	onSelectDay,
}: MonthGridProps) {
	return (
		<View className="px-4 pt-4">
			<View className="mb-2 flex-row items-center justify-between">
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Previous month"
					onPress={onPrevMonth}
					className="size-9 items-center justify-center rounded-full active:opacity-70"
				>
					<Icon as={ChevronLeft} className="size-5 text-foreground" />
				</Pressable>
				<Text className="text-base font-semibold">{grid.title}</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Next month"
					onPress={onNextMonth}
					className="size-9 items-center justify-center rounded-full active:opacity-70"
				>
					<Icon as={ChevronRight} className="size-5 text-foreground" />
				</Pressable>
			</View>

			<View className="flex-row">
				{WEEKDAYS.map((weekday) => (
					<View key={weekday.key} className="flex-1 items-center py-1">
						<Text className="text-xs font-medium text-muted-foreground">
							{weekday.label}
						</Text>
					</View>
				))}
			</View>

			<View className="flex-row flex-wrap">
				{grid.cells.map((cell) => {
					const selected = selectedDayKey === cell.dayKey;
					return (
						<Pressable
							key={cell.dayKey}
							onPress={() => onSelectDay(cell)}
							className="aspect-square items-center justify-center active:opacity-70"
							style={{ width: `${100 / 7}%` }}
						>
							<View
								className={`size-9 items-center justify-center rounded-full ${
									selected
										? "bg-primary"
										: cell.isToday
											? "border border-primary"
											: ""
								}`}
							>
								<Text
									className={
										selected
											? "text-sm font-semibold text-primary-foreground"
											: cell.inMonth
												? "text-sm text-foreground"
												: "text-sm text-muted-foreground/50"
									}
								>
									{cell.day}
								</Text>
							</View>
							<View
								className={`mt-0.5 size-1 rounded-full ${
									cell.eventCount > 0 && !selected
										? "bg-primary"
										: "bg-transparent"
								}`}
							/>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
