/**
 * Generic optimistic-user-message helpers for the unified ChatPaneShell.
 *
 * These are the shared canonical copies of the per-tree
 * `optimisticUserMessage` utils (v2 + legacy). Unlike those forks — which pin
 * `ChatHistoryMessage` to a concrete `UseChatDisplayReturn["messages"]` type —
 * this copy is generic over {@link DisplayMessage} so the shell can stay
 * `<TMessage extends DisplayMessage>` and each wrapper re-narrows at its own
 * render-prop boundary.
 */

import type { DisplayMessage } from "renderer/components/Chat/ChatInterface/transport/messageDisplayHelpers";
import type { ChatSendMessageInput } from "../ChatPaneShell.types";

export function toOptimisticUserMessage<TMessage extends DisplayMessage>(
	input: ChatSendMessageInput,
): TMessage | null {
	const text = input.payload.content.trim();
	const files = input.payload.files ?? [];
	if (!text && files.length === 0) return null;

	return {
		id: `optimistic-${crypto.randomUUID()}`,
		role: "user",
		content: [
			...(text ? [{ type: "text", text }] : []),
			...files.map((file) => ({
				type: "file",
				data: file.data,
				mediaType: file.mediaType,
				filename: file.filename,
			})),
		],
		createdAt: new Date(),
	} as unknown as TMessage;
}

function toUserMessageSignature(message: DisplayMessage): string | null {
	if (message.role !== "user") return null;
	return message.content
		.map((part) => {
			const partRecord = part as {
				type?: string;
				text?: string;
				mimeType?: string;
				data?: string;
				filename?: string;
				mediaType?: string;
			};
			if (partRecord.type === "text") return `text:${partRecord.text}`;
			if (partRecord.type === "image") {
				return `image:${partRecord.mimeType}:${partRecord.data}`;
			}
			if (partRecord.type === "file") {
				return `file:${partRecord.mediaType ?? ""}:${partRecord.filename ?? ""}:${partRecord.data ?? ""}`;
			}
			return `${partRecord.type}:${JSON.stringify(part)}`;
		})
		.join("||");
}

export function hasMatchingUserMessage<TMessage extends DisplayMessage>({
	messages,
	candidate,
}: {
	messages: TMessage[];
	candidate: TMessage;
}): boolean {
	const signature = toUserMessageSignature(candidate);
	if (!signature) return false;
	return messages.some(
		(message) => toUserMessageSignature(message) === signature,
	);
}
