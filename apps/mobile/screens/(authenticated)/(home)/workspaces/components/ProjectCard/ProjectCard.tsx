import type { SelectProject } from "@rox/db/schema";
import { GitBranch } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { repoLabel } from "../../utils/projectMeta";

interface ProjectCardProps {
	project: SelectProject;
	onPress: (projectId: string) => void;
}

export function ProjectCard({ project, onPress }: ProjectCardProps) {
	const repo = repoLabel(project);

	return (
		<Pressable
			onPress={() => onPress(project.id)}
			className="active:opacity-80"
		>
			<Card>
				<CardHeader>
					<CardTitle numberOfLines={1}>{project.name}</CardTitle>
				</CardHeader>
				<CardContent className="gap-2">
					{repo ? (
						<Text className="text-muted-foreground" numberOfLines={1}>
							{repo}
						</Text>
					) : null}
					<View className="flex-row items-center gap-1.5">
						<Icon as={GitBranch} className="size-4 text-muted-foreground" />
						<Text className="text-muted-foreground">
							{project.defaultBranch}
						</Text>
					</View>
				</CardContent>
			</Card>
		</Pressable>
	);
}
