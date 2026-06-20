import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { TaskListItem } from "./components/TaskListItem";
import { useTasksData } from "./hooks/useTasksData";

export function TasksScreen() {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const { sections, isReady } = useTasksData();

	const onRefresh = useCallback(async () => {
		// Electric streams updates continuously, so a manual refetch is a no-op;
		// keep the spinner brief for the expected pull-to-refresh affordance.
		setRefreshing(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		setRefreshing(false);
	}, []);

	const handlePress = useCallback(
		(taskId: string) => {
			router.push(`/(tasks)/${taskId}`);
		},
		[router],
	);

	const hasData = sections.length > 0;

	// Cache-first: render existing rows even before the collection reports ready.
	if (!hasData) {
		if (!isReady) {
			return (
				<View className="flex-1 gap-3 bg-background p-4">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</View>
			);
		}
		return (
			<View className="flex-1 items-center justify-center bg-background p-6">
				<Text className="text-center text-muted-foreground">
					No tasks yet. Tasks created on web or desktop will appear here.
				</Text>
			</View>
		);
	}

	return (
		<SectionList
			className="flex-1 bg-background"
			sections={sections}
			keyExtractor={(item) => item.id}
			contentInsetAdjustmentBehavior="automatic"
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
			renderSectionHeader={({ section }) => (
				<View className="bg-background px-4 pb-1 pt-4">
					<Text className="text-xs font-semibold uppercase text-muted-foreground">
						{section.title} · {section.data.length}
					</Text>
				</View>
			)}
			renderItem={({ item }) => (
				<TaskListItem task={item} onPress={handlePress} />
			)}
		/>
	);
}
