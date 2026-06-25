import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { type OrgMember, type OrgTeam, useMembersAndTeams } from "./hooks";

// Org role labels live in @rox/ui on web, which is DOM-oriented and not a
// mobile dependency. Inline a small RU map for the read-only RN adapter
// (Hermes-borrow F27).
const ROLE_LABELS: Record<string, string> = {
	owner: "Владелец",
	admin: "Администратор",
	member: "Участник",
};

function roleLabel(role: string): string {
	return ROLE_LABELS[role] ?? role;
}

function MemberRow({ member }: { member: OrgMember }) {
	const initial = (member.name ?? member.email ?? "?").charAt(0).toUpperCase();
	return (
		<View className="flex-row items-center gap-3 px-4 py-3">
			<Avatar
				alt={member.name ?? member.email ?? "Участник"}
				className="size-9"
			>
				<AvatarFallback>
					<Text className="text-sm font-semibold">{initial}</Text>
				</AvatarFallback>
			</Avatar>
			<View className="flex-1">
				<Text className="text-base font-medium" numberOfLines={1}>
					{member.name ?? member.email}
				</Text>
				{member.name ? (
					<Text className="text-sm text-muted-foreground" numberOfLines={1}>
						{member.email}
					</Text>
				) : null}
			</View>
			<Text className="text-sm text-muted-foreground">
				{roleLabel(member.role)}
			</Text>
		</View>
	);
}

function TeamRow({ team }: { team: OrgTeam }) {
	return (
		<View className="px-4 py-3">
			<Text className="text-base font-medium" numberOfLines={1}>
				{team.name}
			</Text>
		</View>
	);
}

export function MembersScreen() {
	const insets = useSafeAreaInsets();
	const { members, teams, isLoading, error, refresh } = useMembersAndTeams();
	const [refreshing, setRefreshing] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	let content: React.ReactNode;
	if (error) {
		content = (
			<View className="items-center justify-center py-20 px-6">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (isLoading && members.length === 0 && teams.length === 0) {
		content = (
			<View className="gap-3 p-4">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</View>
		);
	} else {
		content = (
			<View className="px-4 gap-6">
				<View className="gap-2">
					<Text className="text-xs font-medium text-muted-foreground uppercase px-2">
						Участники
					</Text>
					<View className="rounded-xl bg-card">
						{members.length === 0 ? (
							<View className="px-4 py-6">
								<Text className="text-center text-muted-foreground">
									Участников пока нет.
								</Text>
							</View>
						) : (
							members.map((member, index) => (
								<View key={member.memberId}>
									{index > 0 ? <Separator /> : null}
									<MemberRow member={member} />
								</View>
							))
						)}
					</View>
				</View>

				<View className="gap-2">
					<Text className="text-xs font-medium text-muted-foreground uppercase px-2">
						Команды
					</Text>
					<View className="rounded-xl bg-card">
						{teams.length === 0 ? (
							<View className="px-4 py-6">
								<Text className="text-center text-muted-foreground">
									Команд пока нет.
								</Text>
							</View>
						) : (
							teams.map((team, index) => (
								<View key={team.id}>
									{index > 0 ? <Separator /> : null}
									<TeamRow team={team} />
								</View>
							))
						)}
					</View>
				</View>
			</View>
		);
	}

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{
				paddingTop: insets.top + 16,
				paddingBottom: insets.bottom + 24,
			}}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
		>
			{content}
		</ScrollView>
	);
}
