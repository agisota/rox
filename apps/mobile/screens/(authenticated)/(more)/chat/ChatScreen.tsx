import { useRouter } from "expo-router";
import { MessagesSquare } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useCommsThreads } from "./hooks/useCommsThreads";
import { formatChatDate } from "./utils/formatChatDate";
import { formatThreadTitle } from "./utils/formatThreadTitle";

/**
 * Mobile chat/inbox thread list (comms suite). Mirrors `MailScreen`: pull-to-
 * refresh, error/skeleton/empty/list branches, cache-first (existing threads
 * stay rendered during a refresh — skeleton only on the empty first load).
 *
 * The unread badge reads `thread.unreadCount` defensively (`?? 0`); it lights up
 * only when > 0. SSE is deferred for mobile, so the list updates on refresh /
 * re-open / after a send.
 */
export function ChatScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { threads, isLoading, error, refresh } = useCommsThreads();
	const [refreshing, setRefreshing] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleOpen = useCallback(
		(threadId: string) => {
			router.push({
				pathname: "/(authenticated)/(more)/chat/thread",
				params: { threadId },
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
				<Icon as={MessagesSquare} className="size-10 text-muted-foreground" />
				<Text className="mt-3 text-center text-muted-foreground">
					No conversations yet.
				</Text>
			</View>
		);
	} else {
		content = (
			<View>
				{threads.map((thread, index) => {
					const title = formatThreadTitle({
						subject: thread.subject,
						id: thread.id,
					});
					const when = formatChatDate(thread.lastMessageAt);
					// Defensive optional read: `unreadCount` is owned by the parallel
					// server wave; default to 0 so the badge stays hidden if it is absent.
					const unread = thread.unreadCount ?? 0;
					return (
						<View key={thread.id}>
							{index > 0 ? <Separator /> : null}
							<Pressable
								onPress={() => handleOpen(thread.id)}
								className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
							>
								<Icon
									as={MessagesSquare}
									className="size-5 text-muted-foreground"
								/>
								<View className="flex-1">
									<Text className="text-base font-medium" numberOfLines={1}>
										{title}
									</Text>
								</View>
								{when ? (
									<Text className="text-xs text-muted-foreground">{when}</Text>
								) : null}
								{unread > 0 ? (
									<View className="min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5">
										<Text className="text-xs font-semibold text-primary-foreground">
											{unread > 99 ? "99+" : unread}
										</Text>
									</View>
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
