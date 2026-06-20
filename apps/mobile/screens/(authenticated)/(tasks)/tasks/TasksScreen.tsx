import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { CreateTaskSheet } from "./components/CreateTaskSheet";
import { TaskListItem } from "./components/TaskListItem";
import { useTasksData } from "./hooks/useTasksData";

export function TasksScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const [refreshing, setRefreshing] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
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
	let content: React.ReactNode;
	if (!hasData && !isReady) {
		content = (
			<View className="flex-1 gap-3 bg-background p-4">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</View>
		);
	} else if (!hasData) {
		content = (
			<View className="flex-1 items-center justify-center bg-background p-6">
				<Text className="text-center text-muted-foreground">
					No tasks yet. Tap + to create one, or it will appear here once created
					on web or desktop.
				</Text>
			</View>
		);
	} else {
		content = (
			<SectionList
				className="flex-1 bg-background"
				sections={sections}
				keyExtractor={(item) => item.id}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: 96 }}
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

	return (
		<View className="flex-1 bg-background">
			{content}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Create task"
				onPress={() => setCreateOpen(true)}
				style={{ bottom: insets.bottom + 24 }}
				className="absolute right-6 size-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/20"
			>
				<Icon as={Plus} className="size-7 text-primary-foreground" />
			</Pressable>
			<CreateTaskSheet open={createOpen} onOpenChange={setCreateOpen} />
		</View>
	);
}
