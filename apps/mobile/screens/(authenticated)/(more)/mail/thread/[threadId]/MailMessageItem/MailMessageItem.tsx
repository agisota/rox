import { Paperclip } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { apiClient } from "@/lib/trpc/client";
import { useMailMessageBody } from "../../../hooks/useMailMessageBody";
import type { MailMessage } from "../../../hooks/useMailThread";
import { formatMailDate } from "../../../utils/formatMailDate";

export interface MailMessageItemProps {
	message: MailMessage;
}

/**
 * One email in the mobile thread view (FEATURE A). Renders the FULL plaintext
 * body fetched from R2 (`useMailMessageBody`) — React Native has no DOM, so HTML
 * is never injected; the text variant is always safe as a `<Text>` child. While
 * the body loads the snippet shows (cache-first). Attachments are listed when
 * present and opened via a short-TTL presigned `mail.getAttachmentUrl`.
 */
export function MailMessageItem({ message }: MailMessageItemProps) {
	const outbound = message.direction === "outbound";
	const who = outbound ? "You" : message.fromName?.trim() || message.fromAddr;
	const when = formatMailDate(
		message.sentAt ?? message.receivedAt ?? message.createdAt,
	);

	const { body, isLoading } = useMailMessageBody(message.id);
	const text = body?.trim() || message.snippet?.trim() || "(no preview)";

	return (
		<View
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
				<Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
					{message.subject}
				</Text>
			) : null}
			<Text className="mt-2 text-sm text-foreground">
				{isLoading && !body ? message.snippet?.trim() || "Loading…" : text}
			</Text>

			{message.hasAttachments ? (
				<MailAttachments messageId={message.id} />
			) : null}
		</View>
	);
}

interface MailAttachmentsProps {
	messageId: string;
}

/** Attachment list for a message; each opens via a presigned URL. */
function MailAttachments({ messageId }: MailAttachmentsProps) {
	const [attachments, setAttachments] = useState<
		{ id: string; filename: string }[]
	>([]);

	// Load attachment metadata once per message.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await apiClient.mail.getMessage.query({ messageId });
				if (!cancelled) {
					setAttachments(
						res.attachments.map((a) => ({ id: a.id, filename: a.filename })),
					);
				}
			} catch {
				// Best-effort: leave the list empty if metadata can't be fetched.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [messageId]);

	const open = useCallback(async (attachmentId: string) => {
		try {
			const { url } = await apiClient.mail.getAttachmentUrl.mutate({
				attachmentId,
			});
			await Linking.openURL(url);
		} catch {
			// Swallow — opening is best-effort; the user can retry.
		}
	}, []);

	if (attachments.length === 0) return null;

	return (
		<View className="mt-3 gap-1.5">
			{attachments.map((att) => (
				<Pressable
					key={att.id}
					accessibilityRole="button"
					onPress={() => open(att.id)}
					className="flex-row items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5"
				>
					<Icon as={Paperclip} className="size-3.5 text-muted-foreground" />
					<Text className="flex-1 text-xs font-medium" numberOfLines={1}>
						{att.filename}
					</Text>
				</Pressable>
			))}
		</View>
	);
}
