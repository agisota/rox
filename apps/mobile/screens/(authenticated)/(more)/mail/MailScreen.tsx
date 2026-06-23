import { useRouter } from "expo-router";
import { Mail as MailIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useMailThreads } from "./hooks/useMailThreads";
import { formatMailDate } from "./utils/formatMailDate";

export function MailScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { threads, isLoading, error, refresh } = useMailThreads();
	const [refreshing, setRefreshing] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleOpen = useCallback(
		(threadId: string, subject: string | null) => {
			router.push({
				pathname: "/(authenticated)/(more)/mail/thread",
				params: { threadId, subject: subject ?? "" },
			});
		},
		[router],
	);

	const hasData = threads.length > 0;

	let content: React.ReactNode;
	if (error) {
		content = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		content = (
			<View className="gap-3 p-4">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</View>
		);
	} else if (!hasData) {
		content = (
			<View className="items-center justify-center py-20 px-6">
				<Icon as={MailIcon} className="size-10 text-muted-foreground" />
				<Text className="mt-3 text-center text-muted-foreground">
					Your inbox is empty.
				</Text>
			</View>
		);
	} else {
		content = (
			<View>
				{threads.map((thread, index) => {
					const subject = thread.subjectNorm?.trim() || "(no subject)";
					const when = formatMailDate(thread.lastMessageAt);
					return (
						<View key={thread.id}>
							{index > 0 ? <Separator /> : null}
							<Pressable
								onPress={() => handleOpen(thread.id, thread.subjectNorm)}
								className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
							>
								<Icon as={MailIcon} className="size-5 text-muted-foreground" />
								<View className="flex-1">
									<Text className="text-base font-medium" numberOfLines={1}>
										{subject}
									</Text>
									<Text className="text-xs text-muted-foreground">
										{thread.messageCount}{" "}
										{thread.messageCount === 1 ? "message" : "messages"}
									</Text>
								</View>
								{when ? (
									<Text className="text-xs text-muted-foreground">{when}</Text>
								) : null}
							</Pressable>
						</View>
					);
				})}
			</View>
		);
	}

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{content}
			</ScrollView>
		</View>
	);
}
