import { ROX_CHAT_MODEL } from "@rox/shared/chat-models";
import { selectContextUsage } from "@rox/shared/context-usage";
import { useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { MicButton } from "@/components/voice/MicButton";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import type { MobileRecording } from "@/lib/voice/useDictation";
import { useCommsRealtime } from "../../hooks/useCommsRealtime";
import { useCommsThread } from "../../hooks/useCommsThread";
import { buildSendRecipients } from "../../utils/buildSendRecipients";
import { formatThreadTitle } from "../../utils/formatThreadTitle";
import { ChatContextRing } from "./ChatContextRing";
import { ChatMessageBubble } from "./ChatMessageBubble";

/**
 * Mobile chat thread view (comms suite). Mirrors `MailThreadScreen`:
 * KeyboardAvoidingView + ScrollView(RefreshControl) of message bubbles + a
 * bottom composer (Textarea + round Send). `threadId` comes from the query param
 * (flat-file convention). Auto-scrolls to the newest message when the count
 * changes. Send is disabled while empty/sending or when no rox-user recipient
 * can be derived (comms.sendMessage requires >=1 recipient).
 */
export function ChatThreadScreen() {
	const insets = useSafeAreaInsets();
	const { threadId } = useLocalSearchParams<{ threadId: string }>();
	const { data: session } = useSession();
	const currentUserId = session?.user?.id;

	const {
		thread,
		messages,
		participants,
		isLoading,
		error,
		sending,
		sendError,
		reply,
		refresh,
	} = useCommsThread(threadId);
	const [refreshing, setRefreshing] = useState(false);
	const [draft, setDraft] = useState("");

	// Live updates while the thread is open: poll the open thread's messages on a
	// tighter interval (foregrounded + active-org gated; pauses on background).
	// `refresh()` is cache-first — it never blanks existing messages mid-poll.
	useCommsRealtime({
		openThreadId: threadId ?? null,
		onRefreshOpenThread: refresh,
	});

	const scrollRef = useRef<ScrollView>(null);
	const messageCount = messages.length;

	// Auto-scroll to the newest message when the count changes (mirror web
	// ThreadView auto-scroll). `false` keeps it snappy on incremental loads.
	useEffect(() => {
		if (messageCount > 0) {
			scrollRef.current?.scrollToEnd({ animated: false });
		}
	}, [messageCount]);

	// Author display-name map: rox users only (P0 in-app), matching web.
	const nameByUserId = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of participants) {
			if (p.userId) map.set(p.userId, `Участник ${p.userId.slice(0, 6)}`);
		}
		return map;
	}, [participants]);

	// Disable Send when there is no derivable recipient (self-only / external-only
	// thread) so we never fire a guaranteed 400 (schema requires >=1 recipient).
	const canSend = buildSendRecipients(participants, currentUserId).length > 0;

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleSend = useCallback(async () => {
		const ok = await reply(draft);
		if (ok) setDraft("");
	}, [draft, reply]);

	// Shared dictation (hold-to-record) into the draft, mirroring CreateTaskSheet
	// and the desktop/web composers — one shared MicButton, transcribe via the
	// same voice router. Honors tap-and-hold gestures (MicButton press-in/out).
	const [transcribing, setTranscribing] = useState(false);
	const handleDictation = useCallback(async (recording: MobileRecording) => {
		setTranscribing(true);
		try {
			const result = await apiClient.voice.transcribe.mutate({
				audioBase64: recording.audioBase64,
				mimeType: recording.mimeType,
				durationMs: recording.durationMs,
			});
			const text = result.processed?.ru || result.rawText;
			if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text));
		} catch {
			// Keep the composer usable on failure; the user can retry or type.
		} finally {
			setTranscribing(false);
		}
	}, []);

	// F42: live context-usage ring, computed by the same shared cross-platform
	// selector the web/desktop composers use so all surfaces agree.
	const contextUsage = useMemo(
		() =>
			selectContextUsage(
				messages.map((message) => message.body ?? ""),
				ROX_CHAT_MODEL.id,
			),
		[messages],
	);

	const hasData = messages.length > 0;
	const sendDisabled = draft.trim().length === 0 || sending || !canSend;

	let body: React.ReactNode;
	if (error) {
		body = (
			<View className="items-center justify-center py-20 px-6">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		body = (
			<View className="gap-3 p-4">
				<Skeleton className="h-12 w-2/3" />
				<Skeleton className="h-12 w-1/2 self-end" />
			</View>
		);
	} else if (!hasData) {
		body = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-muted-foreground">
					Сообщений пока нет — напишите первое.
				</Text>
			</View>
		);
	} else {
		body = (
			<View className="gap-3 p-4">
				{messages.map((message) => (
					<ChatMessageBubble
						key={message.id}
						message={message}
						currentUserId={currentUserId}
						authorName={
							message.authorUserId
								? (nameByUserId.get(message.authorUserId) ?? "Участник")
								: "Внешний контакт"
						}
					/>
				))}
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
				ref={scrollRef}
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{thread ? (
					<Text className="px-4 pt-4 text-lg font-semibold" numberOfLines={2}>
						{formatThreadTitle({ subject: thread.subject, id: thread.id })}
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
				{!canSend && hasData ? (
					<Text className="pb-1 text-xs text-muted-foreground">
						No recipient to reply to.
					</Text>
				) : null}
				{hasData ? (
					<View className="flex-row items-center justify-end pb-1">
						<ChatContextRing
							usedTokens={contextUsage.usedTokens}
							maxTokens={contextUsage.maxTokens}
						/>
					</View>
				) : null}
				<View className="flex-row items-end gap-2">
					<Textarea
						className="max-h-32 flex-1"
						placeholder="Сообщение…"
						value={draft}
						onChangeText={setDraft}
						editable={!sending}
					/>
					<MicButton onComplete={handleDictation} transcribing={transcribing} />
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Send message"
						onPress={handleSend}
						disabled={sendDisabled}
						className={`size-11 items-center justify-center rounded-full ${
							sendDisabled ? "bg-muted" : "bg-primary"
						}`}
					>
						<Icon as={Send} className="size-5 text-primary-foreground" />
					</Pressable>
				</View>
			</View>
		</KeyboardAvoidingView>
	);
}
