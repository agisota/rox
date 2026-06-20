import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, GitBranch } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { repoLabel } from "@/screens/(authenticated)/(home)/workspaces/utils/projectMeta";
import { useProjectDetail } from "./hooks/useProjectDetail";

export function WorkspaceDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { project, isReady } = useProjectDetail(id);

	const repo = project ? repoLabel(project) : null;

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
						{project?.name ?? "Workspace"}
					</Text>
				</View>

				{!project ? (
					isReady ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								Project not found.
							</Text>
						</View>
					) : (
						<View className="gap-3">
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-24 w-full" />
						</View>
					)
				) : (
					<>
						<Card>
							<CardHeader>
								<CardTitle>Repository</CardTitle>
							</CardHeader>
							<CardContent className="gap-2">
								{repo ? (
									<Text className="text-muted-foreground">{repo}</Text>
								) : (
									<Text className="text-muted-foreground">No repository</Text>
								)}
								<View className="flex-row items-center gap-1.5">
									<Icon
										as={GitBranch}
										className="size-4 text-muted-foreground"
									/>
									<Text className="text-muted-foreground">
										{project.defaultBranch}
									</Text>
								</View>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Claude Session</CardTitle>
							</CardHeader>
							<CardContent>
								<Badge variant="secondary">
									<Text>Coming soon</Text>
								</Badge>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Terminal</CardTitle>
							</CardHeader>
							<CardContent>
								<Badge variant="secondary">
									<Text>Coming soon</Text>
								</Badge>
							</CardContent>
						</Card>
					</>
				)}
			</View>
		</ScrollView>
	);
}
