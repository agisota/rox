import { Pressable, View } from "react-native";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import type { TaskWithStatus } from "../../utils/groupByStatus";
import { assigneeInitials, priorityLabel, taskRef } from "../../utils/taskMeta";

interface TaskListItemProps {
	task: TaskWithStatus;
	onPress: (taskId: string) => void;
}

export function TaskListItem({ task, onPress }: TaskListItemProps) {
	const ref = taskRef(task);
	const priority = priorityLabel(task.priority);
	const assignee = task.assignee;

	return (
		<Pressable
			onPress={() => onPress(task.id)}
			className="flex-row items-center gap-3 border-border border-b bg-background px-4 py-3 active:bg-muted"
		>
			<View
				className="size-2.5 rounded-full"
				style={{ backgroundColor: task.status.color }}
				accessibilityLabel={`Status: ${task.status.name}`}
			/>

			<View className="flex-1 gap-1">
				<Text className="font-medium" numberOfLines={1}>
					{task.title}
				</Text>
				<View className="flex-row items-center gap-2">
					{ref ? (
						<Badge variant="secondary">
							<Text>{ref}</Text>
						</Badge>
					) : null}
					{priority ? (
						<Badge variant="outline">
							<Text>{priority}</Text>
						</Badge>
					) : null}
				</View>
			</View>

			{assignee ? (
				<Avatar
					alt={assignee.name}
					className="size-7"
					accessibilityLabel={`Assignee: ${assignee.name}`}
				>
					{assignee.image ? (
						<AvatarImage source={{ uri: assignee.image }} />
					) : null}
					<AvatarFallback>
						<Text className="text-xs">{assigneeInitials(assignee.name)}</Text>
					</AvatarFallback>
				</Avatar>
			) : null}
		</Pressable>
	);
}
