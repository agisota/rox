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
import { useWorkspaceAccess } from "@/screens/(authenticated)/hooks/useWorkspaceAccess";
import { WorkspaceRowSurface } from "./components/WorkspaceRowSurface";
import { useProjectDetail } from "./hooks/useProjectDetail";
import { useProjectWorkspaces } from "./hooks/useProjectWorkspaces";

/** Centered message used for the auth/empty states. */
function CenteredNotice({ children }: { children: string }) {
	return (
		<View className="items-center justify-center py-20">
			<Text className="text-center text-muted-foreground">{children}</Text>
		</View>
	);
}

export function WorkspaceDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { project, isReady } = useProjectDetail(id);
	const { workspaces } = useProjectWorkspaces(id);

	// FN-086: gate the screen on @rox/auth + project ownership. The project's
	// org must match the active org; otherwise show a clear access state instead
	// of an empty workspace.
	const { access } = useWorkspaceAccess({
		projectOrganizationId: project?.organizationId,
		isProjectResolved: isReady,
	});

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

				{access === "signedOut" ? (
					<CenteredNotice>Sign in to view this workspace.</CenteredNotice>
				) : access === "noOrg" ? (
					<CenteredNotice>
						Select an organization to view its workspaces.
					</CenteredNotice>
				) : access === "noAccess" ? (
					<CenteredNotice>
						You don&apos;t have access to this workspace in the current
						organization.
					</CenteredNotice>
				) : access === "loading" || !project ? (
					<View className="gap-3">
						<Skeleton className="h-24 w-full" />
						<Skeleton className="h-24 w-full" />
					</View>
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
								<CardTitle>Workspaces</CardTitle>
							</CardHeader>
							<CardContent className="gap-3">
								{workspaces.length === 0 ? (
									<Text className="text-muted-foreground">
										No workspaces yet for this project.
									</Text>
								) : (
									workspaces.map((workspace) => (
										<View key={workspace.id} className="gap-1">
											<View className="flex-row items-center justify-between gap-2">
												<View className="flex-1 gap-0.5">
													<Text numberOfLines={1} className="font-medium">
														{workspace.name}
													</Text>
													<View className="flex-row items-center gap-1.5">
														<Icon
															as={GitBranch}
															className="size-3.5 text-muted-foreground"
														/>
														<Text
															numberOfLines={1}
															className="text-sm text-muted-foreground"
														>
															{workspace.branch}
														</Text>
													</View>
												</View>
												<Badge variant="outline">
													<Text>{workspace.type}</Text>
												</Badge>
											</View>
											<WorkspaceRowSurface workspaceId={workspace.id} />
										</View>
									))
								)}
							</CardContent>
						</Card>
					</>
				)}
			</View>
		</ScrollView>
	);
}
