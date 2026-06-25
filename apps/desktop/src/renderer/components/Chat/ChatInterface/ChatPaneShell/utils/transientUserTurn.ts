/**
 * Generic transient-user-turn helpers for the unified ChatPaneShell.
 *
 * Shared canonical copy of the per-tree `transientUserTurn` utils. Generic over
 * {@link DisplayMessage} so the optimistic user message survives stale snapshot
 * polls regardless of the concrete backend message shape.
 */

import type { DisplayMessage } from "renderer/components/Chat/ChatInterface/transport/messageDisplayHelpers";
import { hasMatchingUserMessage } from "./optimisticUserMessage";

export type PendingUserTurn<TMessage extends DisplayMessage> =
	| {
			kind: "append";
			message: TMessage;
	  }
	| {
			kind: "restart";
			message: TMessage;
			prefixMessages: TMessage[];
	  };

export function shouldClearPendingUserTurn<TMessage extends DisplayMessage>({
	messages,
	pendingUserTurn,
	isAwaitingAssistant,
}: {
	messages: TMessage[];
	pendingUserTurn: PendingUserTurn<TMessage> | null;
	isAwaitingAssistant: boolean;
}): boolean {
	if (!pendingUserTurn) return false;
	if (
		!hasMatchingUserMessage({
			messages,
			candidate: pendingUserTurn.message,
		})
	) {
		return false;
	}

	if (pendingUserTurn.kind === "restart" && isAwaitingAssistant) {
		return false;
	}

	return true;
}

export function getVisibleMessagesWithPendingUserTurn<
	TMessage extends DisplayMessage,
>({
	messages,
	pendingUserTurn,
	isAwaitingAssistant,
}: {
	messages: TMessage[];
	pendingUserTurn: PendingUserTurn<TMessage> | null;
	isAwaitingAssistant: boolean;
}): TMessage[] {
	if (!pendingUserTurn) return messages;

	const hasPersistedMessage = hasMatchingUserMessage({
		messages,
		candidate: pendingUserTurn.message,
	});

	if (pendingUserTurn.kind === "restart") {
		if (isAwaitingAssistant || !hasPersistedMessage) {
			return [...pendingUserTurn.prefixMessages, pendingUserTurn.message];
		}
		return messages;
	}

	if (hasPersistedMessage) {
		return messages;
	}

	return [...messages, pendingUserTurn.message];
}
