import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AgendaItemRow } from "./components/AgendaItemRow";
import { useAgenda } from "./hooks/useAgenda";

export function CalendarScreen() {
	const router = useRouter();
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

	const hasData = sections.length > 0;

	if (error) {
		return (
			<View className="flex-1 items-center justify-center bg-background p-6">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	}

	if (!hasData && isLoading) {
		return (
			<View className="flex-1 gap-3 bg-background p-4">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</View>
		);
	}

	if (!hasData) {
		return (
			<View className="flex-1 items-center justify-center bg-background p-6">
				<Text className="text-center text-muted-foreground">
					No upcoming events in the next 30 days. Create events on web or
					desktop to see them here.
				</Text>
			</View>
		);
	}

	return (
		<SectionList
			className="flex-1 bg-background"
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
