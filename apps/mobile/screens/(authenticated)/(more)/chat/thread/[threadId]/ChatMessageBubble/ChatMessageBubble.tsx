import { Paperclip } from "lucide-react-native";
import { useCallback } from "react";
import { Linking, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { CommsMessage } from "../../../hooks/useCommsThread";
import { formatChatDate } from "../../../utils/formatChatDate";

export interface ChatMessageBubbleProps {
	message: CommsMessage;
	/** The viewer's user id — decides own (right) vs other (left) alignment. */
	currentUserId: string | undefined;
	/** Display name for the author (resolved by the parent from participants). */
	authorName: string;
}

/**
 * RN port of the web inbox `MessageBubble`. Own messages align right with the
 * primary tint; others align left with a small author label. The body renders as
 * a `<Text>` — React Native has no DOM, so HTML/`bodyHtml` is NEVER injected
 * (same constraint as `MailMessageItem`). Inline `attachments` (jsonb on the row,
 * no extra fetch) open via `Linking.openURL`.
 *
 * Defensive wave compat: a deleted message (`deletedAt`) shows a muted italic
 * tombstone instead of its body/attachments; an edited message (`editedAt`)
 * appends a subtle "· изменено" marker. Both use optional reads so the component
 * compiles whether or not the parallel server wave has merged.
 */
export function ChatMessageBubble({
	message,
	currentUserId,
	authorName,
}: ChatMessageBubbleProps) {
	const isOwn =
		Boolean(currentUserId) && message.authorUserId === currentUserId;
	const isDeleted = Boolean(message.deletedAt);
	const isEdited = Boolean(message.editedAt);
	const attachments = isDeleted ? [] : (message.attachments ?? []);
	const when = formatChatDate(message.createdAt);

	const openAttachment = useCallback(async (url: string) => {
		try {
			await Linking.openURL(url);
		} catch {
			// Opening is best-effort; the user can retry.
		}
	}, []);

	return (
		<View className={isOwn ? "items-end" : "items-start"}>
			{!isOwn ? (
				<Text className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
					{authorName}
				</Text>
			) : null}
			<View
				className={`max-w-[80%] rounded-2xl px-3 py-2 ${
					isOwn ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-secondary"
				}`}
			>
				{isDeleted ? (
					<Text className="text-sm italic text-muted-foreground">
						Сообщение удалено
					</Text>
				) : (
					<>
						{message.body ? (
							<Text
								className={`text-sm ${
									isOwn
										? "text-primary-foreground"
										: "text-secondary-foreground"
								}`}
							>
								{message.body}
							</Text>
						) : null}
						{attachments.length > 0 ? (
							<View className="mt-1.5 gap-1.5">
								{attachments.map((att) => (
									<Pressable
										key={`${message.id}-${att.url}`}
										accessibilityRole="button"
										accessibilityLabel={att.name}
										onPress={() => openAttachment(att.url)}
										className="flex-row items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5"
									>
										<Icon
											as={Paperclip}
											className="size-3.5 text-muted-foreground"
										/>
										<Text
											className="flex-1 text-xs font-medium"
											numberOfLines={1}
										>
											{att.name}
										</Text>
									</Pressable>
								))}
							</View>
						) : null}
					</>
				)}
			</View>
			<Text className="mt-0.5 px-1 text-[10px] text-muted-foreground">
				{when ?? ""}
				{!isDeleted && isEdited ? " · изменено" : ""}
			</Text>
		</View>
	);
}
