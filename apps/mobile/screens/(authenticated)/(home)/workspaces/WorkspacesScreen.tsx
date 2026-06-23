import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
	RefreshControl,
	ScrollView,
	useWindowDimensions,
	View,
} from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { ProjectCard } from "./components/ProjectCard";
import { useProjectsData } from "./hooks/useProjectsData";

export function WorkspacesScreen() {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const { width } = useWindowDimensions();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();
	const { projects, isReady } = useProjectsData();

	const handleSwitchOrganization = (organizationId: string) => {
		setSheetOpen(false);
		switchOrganization(organizationId);
	};

	const onRefresh = useCallback(async () => {
		// Electric streams updates; keep a brief spinner for the pull affordance.
		setRefreshing(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		setRefreshing(false);
	}, []);

	const handleProjectPress = useCallback(
		(projectId: string) => {
			router.push(`/(home)/workspaces/${projectId}`);
		},
		[router],
	);

	const hasProjects = projects.length > 0;

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => setSheetOpen(true)}
			/>
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View className="gap-3 p-6">
					{hasProjects ? (
						projects.map((project) => (
							<ProjectCard
								key={project.id}
								project={project}
								onPress={handleProjectPress}
							/>
						))
					) : isReady ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								No projects yet. Create a project on web or desktop to see it
								here.
							</Text>
						</View>
					) : (
						<>
							<Skeleton className="h-28 w-full" />
							<Skeleton className="h-28 w-full" />
						</>
					)}
				</View>
			</ScrollView>
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
		</>
	);
}
