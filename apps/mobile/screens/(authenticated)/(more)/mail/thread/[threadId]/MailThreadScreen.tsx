import { useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	RefreshControl,
	ScrollView,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useMailThread } from "../../hooks/useMailThread";
import { formatMailDate } from "../../utils/formatMailDate";

export function MailThreadScreen() {
	const insets = useSafeAreaInsets();
	const { threadId } = useLocalSearchParams<{
		threadId: string;
		subject?: string;
	}>();
	const {
		thread,
		messages,
		isLoading,
		error,
		sending,
		sendError,
		reply,
		refresh,
	} = useMailThread(threadId);
	const [refreshing, setRefreshing] = useState(false);
	const [draft, setDraft] = useState("");

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleSend = useCallback(async () => {
		const ok = await reply(draft);
		if (ok) setDraft("");
	}, [draft, reply]);

	const hasData = messages.length > 0;

	let body: React.ReactNode;
	if (error) {
		body = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		body = (
			<View className="gap-3 p-4">
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-20 w-full" />
			</View>
		);
	} else if (!hasData) {
		body = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-muted-foreground">
					No messages in this thread.
				</Text>
			</View>
		);
	} else {
		body = (
			<View className="gap-3 p-4">
				{messages.map((message) => {
					const outbound = message.direction === "outbound";
					const who = outbound
						? "You"
						: message.fromName?.trim() || message.fromAddr;
					const when = formatMailDate(
						message.sentAt ?? message.receivedAt ?? message.createdAt,
					);
					return (
						<View
							key={message.id}
							className={`rounded-xl border border-border p-3 ${
								outbound ? "bg-primary/5" : "bg-card"
							}`}
						>
							<View className="flex-row items-center justify-between gap-2">
								<Text className="flex-1 text-sm font-medium" numberOfLines={1}>
									{who}
								</Text>
								{when ? (
									<Text className="text-xs text-muted-foreground">{when}</Text>
								) : null}
							</View>
							{message.subject ? (
								<Text
									className="mt-1 text-xs text-muted-foreground"
									numberOfLines={1}
								>
									{message.subject}
								</Text>
							) : null}
							<Text className="mt-2 text-sm text-foreground">
								{message.snippet?.trim() || "(no preview)"}
							</Text>
						</View>
					);
				})}
			</View>
		);
	}

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-background"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
		>
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{thread?.subjectNorm ? (
					<Text className="px-4 pt-4 text-lg font-semibold" numberOfLines={2}>
						{thread.subjectNorm}
					</Text>
				) : null}
				{body}
			</ScrollView>

			<View
				className="border-t border-border bg-background px-4 pt-2"
				style={{ paddingBottom: insets.bottom + 8 }}
			>
				{sendError ? (
					<Text className="pb-1 text-xs text-destructive">{sendError}</Text>
				) : null}
				<View className="flex-row items-end gap-2">
					<Textarea
						className="max-h-32 flex-1"
						placeholder="Reply…"
						value={draft}
						onChangeText={setDraft}
						editable={!sending}
					/>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Send reply"
						onPress={handleSend}
						disabled={draft.trim().length === 0 || sending}
						className={`size-11 items-center justify-center rounded-full ${
							draft.trim().length === 0 || sending ? "bg-muted" : "bg-primary"
						}`}
					>
						<Icon as={Send} className="size-5 text-primary-foreground" />
					</Pressable>
				</View>
			</View>
		</KeyboardAvoidingView>
	);
}
