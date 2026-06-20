import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, ExternalLink } from "lucide-react-native";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
	assigneeInitials,
	priorityLabel,
	taskRef,
} from "@/screens/(authenticated)/(tasks)/tasks/utils/taskMeta";
import { useTaskDetail } from "./hooks/useTaskDetail";

function formatDate(value: Date | string | null): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString();
}

export function TaskDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { task, isReady, canComplete, markComplete } = useTaskDetail(id);

	const ref = task ? taskRef(task) : null;
	const priority = task ? priorityLabel(task.priority) : null;
	const due = task ? formatDate(task.dueDate) : null;

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top }}
		>
			<View className="gap-4 p-6">
				<View className="flex-row items-center gap-2">
					<Pressable onPress={() => router.back()} className="p-1">
						<Icon as={ChevronLeft} className="size-6 text-foreground" />
					</Pressable>
					<Text className="text-2xl font-bold" numberOfLines={1}>
						{task?.title ?? "Task"}
					</Text>
				</View>

				{!task ? (
					isReady ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								Task not found.
							</Text>
						</View>
					) : (
						<View className="gap-3">
							<Skeleton className="h-6 w-2/3" />
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-16 w-full" />
						</View>
					)
				) : (
					<>
						<View className="flex-row flex-wrap items-center gap-2">
							<Badge variant="secondary">
								<View
									className="mr-1 size-2 rounded-full"
									style={{ backgroundColor: task.status.color }}
								/>
								<Text>{task.status.name}</Text>
							</Badge>
							{ref ? (
								<Badge variant="outline">
									<Text>{ref}</Text>
								</Badge>
							) : null}
							{priority ? (
								<Badge variant="outline">
									<Text>{priority}</Text>
								</Badge>
							) : null}
						</View>

						{task.description ? (
							<Card>
								<CardHeader>
									<CardTitle>Description</CardTitle>
								</CardHeader>
								<CardContent>
									<Text className="text-muted-foreground">
										{task.description}
									</Text>
								</CardContent>
							</Card>
						) : null}

						<Card>
							<CardHeader>
								<CardTitle>Details</CardTitle>
							</CardHeader>
							<CardContent className="gap-3">
								<View className="flex-row items-center justify-between">
									<Text className="text-muted-foreground">Assignee</Text>
									{task.assignee ? (
										<View className="flex-row items-center gap-2">
											<Avatar alt={task.assignee.name} className="size-6">
												{task.assignee.image ? (
													<AvatarImage source={{ uri: task.assignee.image }} />
												) : null}
												<AvatarFallback>
													<Text className="text-xs">
														{assigneeInitials(task.assignee.name)}
													</Text>
												</AvatarFallback>
											</Avatar>
											<Text>{task.assignee.name}</Text>
										</View>
									) : (
										<Text className="text-muted-foreground">Unassigned</Text>
									)}
								</View>

								{due ? (
									<View className="flex-row items-center justify-between">
										<Text className="text-muted-foreground">Due</Text>
										<Text>{due}</Text>
									</View>
								) : null}

								{task.branch ? (
									<View className="flex-row items-center justify-between">
										<Text className="text-muted-foreground">Branch</Text>
										<Text numberOfLines={1} className="max-w-[60%]">
											{task.branch}
										</Text>
									</View>
								) : null}
							</CardContent>
						</Card>

						{task.prUrl ? (
							<Button
								variant="outline"
								onPress={() => {
									if (task.prUrl) void Linking.openURL(task.prUrl);
								}}
							>
								<Icon as={ExternalLink} className="size-4 text-foreground" />
								<Text>Open pull request</Text>
							</Button>
						) : null}

						{canComplete ? (
							<Button onPress={markComplete}>
								<Icon
									as={CheckCircle2}
									className="size-4 text-primary-foreground"
								/>
								<Text>Mark complete</Text>
							</Button>
						) : null}
					</>
				)}
			</View>
		</ScrollView>
	);
}
