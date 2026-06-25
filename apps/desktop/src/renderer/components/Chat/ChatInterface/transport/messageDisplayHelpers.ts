/**
 * Transport-agnostic message-display helpers shared by the unified
 * `useChatDisplay`. These were previously forked across the v2
 * `useWorkspaceChatDisplay` and the `@rox/chat/client` `useChatDisplay`; they
 * now live exactly once so any future fix to optimistic-turn handling or
 * active-turn dedup is applied in a single place.
 *
 * Messages are treated structurally (`role`, `content[]`, optional `id` /
 * `stopReason`) so the helpers work against either backend's message shape.
 */

import { hasAnsweredQuestionToolCall } from "renderer/components/Chat/ChatInterface/utils/messageHelpers";

export interface DisplayMessagePart {
	type?: string;
	text?: string;
}

/**
 * Structural shape the display helpers read. Backend message types
 * (host-service `HarnessMessage`, chat-runtime message) satisfy this
 * structurally: each carries `role`, an optional `id` / `stopReason` /
 * `errorMessage`, and a `content` array whose members each have a `type` and
 * optional `text`. `content` is typed as a readonly array of an open part shape
 * so concrete (narrower) backend content unions remain assignable.
 */
export interface DisplayMessage {
	id?: string;
	role?: string;
	stopReason?: string;
	errorMessage?: string;
	content: ReadonlyArray<{ type?: string; text?: string }>;
}

export interface DisplayCurrentMessage {
	id?: string;
	role?: string;
	content?: unknown[];
}

function findLastCommittedUserMessageIndex<T extends DisplayMessage>(
	messages: T[],
): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		// INVARIANT: optimistic user messages use the "optimistic-" ID prefix
		// (both the internal optimistic channel and any setData injection).
		// Skipping them anchors the turn boundary to the real committed user
		// message so the in-flight assistant message can be deduped. See
		// SUPER-753 — this is the stricter `@rox/chat` behaviour; the older v2
		// fork omitted the prefix guard.
		if (message?.role === "user" && !message.id?.startsWith("optimistic-")) {
			return index;
		}
	}
	return -1;
}

export function findLatestAssistantErrorMessage<T extends DisplayMessage>(
	messages: T[],
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		if (message.stopReason !== undefined && message.stopReason !== "error") {
			return null;
		}
		if (
			typeof message.errorMessage === "string" &&
			message.errorMessage.trim().length > 0
		) {
			return message.errorMessage.trim();
		}
		return null;
	}
	return null;
}

/**
 * Strip the in-flight assistant message(s) of the active turn from history so
 * the live `currentMessage` is the single source of truth while running. A
 * completed prior-phase assistant message (has `stopReason`, different id from
 * the streaming message) is retained; answered-question turns are also kept.
 */
export function withoutActiveTurnAssistantHistory<T extends DisplayMessage>({
	messages,
	currentMessage,
	isRunning,
}: {
	messages: T[];
	currentMessage: DisplayCurrentMessage | null;
	isRunning: boolean;
}): T[] {
	if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
		return messages;
	}

	const turnStartIndex = findLastCommittedUserMessageIndex(messages) + 1;
	const previousTurns = messages.slice(0, turnStartIndex);
	const activeTurnMessages = messages.slice(turnStartIndex);
	const currentMessageId = currentMessage.id;

	const deduped = activeTurnMessages.filter((message) => {
		if (message.role !== "assistant") return true;
		if (
			hasAnsweredQuestionToolCall(
				message as unknown as Parameters<typeof hasAnsweredQuestionToolCall>[0],
			)
		) {
			return true;
		}
		const { stopReason, id } = message;
		return !!stopReason && id !== currentMessageId;
	});

	return [...previousTurns, ...deduped];
}

export function hasFileOrImagePart(message: DisplayMessage): boolean {
	return message.content.some(
		(part) => part.type === "file" || part.type === "image",
	);
}

export function countFileMessages<T extends DisplayMessage>(
	messages: T[],
): number {
	return messages.filter(
		(message) => message.role === "user" && hasFileOrImagePart(message),
	).length;
}

export function getLegacyImagePayload(
	payload: unknown,
): Array<{ data: string; mimeType: string }> {
	const images = (payload as { images?: unknown } | null)?.images;
	if (!Array.isArray(images)) return [];
	return images.flatMap((image) => {
		const record = image as { data?: unknown; mimeType?: unknown };
		return typeof record.data === "string" &&
			typeof record.mimeType === "string"
			? [{ data: record.data, mimeType: record.mimeType }]
			: [];
	});
}
