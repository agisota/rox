import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AgendaItemRow } from "./components/AgendaItemRow";
import { MonthView } from "./components/MonthView";
import { useAgenda } from "./hooks/useAgenda";

type CalendarView = "agenda" | "month";

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
	{ value: "agenda", label: "Agenda" },
	{ value: "month", label: "Month" },
];

function ViewToggle({
	view,
	onChange,
}: {
	view: CalendarView;
	onChange: (next: CalendarView) => void;
}) {
	return (
		<View className="flex-row gap-1 rounded-full bg-muted p-1">
			{VIEW_OPTIONS.map((option) => {
				const active = view === option.value;
				return (
					<Pressable
						key={option.value}
						onPress={() => onChange(option.value)}
						className={`rounded-full px-4 py-1.5 ${active ? "bg-background" : ""}`}
					>
						<Text
							className={
								active
									? "text-sm font-medium text-foreground"
									: "text-sm text-muted-foreground"
							}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function CalendarScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const [view, setView] = useState<CalendarView>("agenda");
	const { sections, isLoading, error, refresh } = useAgenda();
	const [refreshing, setRefreshing] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handlePress = useCallback(
		(eventId: string) => {
			router.push({
				pathname: "/(authenticated)/(more)/calendar/event",
				params: { eventId },
			});
		},
		[router],
	);

	const handleCreate = useCallback(() => {
		router.push("/(authenticated)/(more)/calendar/event-new");
	}, [router]);

	const hasData = sections.length > 0;

	let agenda: React.ReactNode;
	if (error) {
		agenda = (
			<View className="flex-1 items-center justify-center p-6">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		agenda = (
			<View className="flex-1 gap-3 p-4">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</View>
		);
	} else if (!hasData) {
		agenda = (
			<View className="flex-1 items-center justify-center p-6">
				<Text className="text-center text-muted-foreground">
					No upcoming events in the next 30 days. Tap + to create one.
				</Text>
			</View>
		);
	} else {
		agenda = (
			<SectionList
				className="flex-1"
				sections={sections}
				keyExtractor={(item, index) =>
					`${item.eventId}-${item.start.getTime()}-${index}`
				}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: 96 }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				renderSectionHeader={({ section }) => (
					<View className="bg-background px-4 pb-1 pt-4">
						<Text className="text-xs font-semibold uppercase text-muted-foreground">
							{section.title}
						</Text>
					</View>
				)}
				renderItem={({ item }) => (
					<AgendaItemRow item={item} onPress={handlePress} />
				)}
			/>
		);
	}

	return (
		<View className="flex-1 bg-background">
			<View className="items-center px-4 pb-2 pt-3">
				<ViewToggle view={view} onChange={setView} />
			</View>

			{view === "agenda" ? agenda : <MonthView onPressEvent={handlePress} />}

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Create event"
				onPress={handleCreate}
				style={{ bottom: insets.bottom + 24 }}
				className="absolute right-6 size-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/20"
			>
				<Icon as={Plus} className="size-7 text-primary-foreground" />
			</Pressable>
		</View>
	);
}
