/**
 * Unified, transport-parameterized chat-display hook.
 *
 * This is the single home for the optimistic user-turn injection and the
 * active-turn assistant dedup that were previously forked between the v2
 * `useWorkspaceChatDisplay` (over `workspaceTrpc.chat.*`) and the
 * `@rox/chat/client` `useChatDisplay` (over the chat-runtime IPC client).
 *
 * The backend is supplied as a {@link ChatTransport}; this hook owns everything
 * that is backend-independent:
 *   - merging an optimistic user message until the server echoes it,
 *   - stripping the in-flight assistant message from history while running,
 *   - surfacing the latest assistant error / query error / command error,
 *   - exposing a `commands` facade with consistent error capture.
 *
 * `displayState` from the snapshot is spread into the return so backend-specific
 * fields (currentMessage, isRunning, activeTools, toolInputBuffers,
 * activeSubagents, pendingApproval, pendingPlanApproval, pendingQuestion, …)
 * flow through unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	countFileMessages,
	type DisplayMessage,
	findLatestAssistantErrorMessage,
	getLegacyImagePayload,
	withoutActiveTurnAssistantHistory,
} from "./messageDisplayHelpers";
import type {
	ChatApprovalArgs,
	ChatPlanArgs,
	ChatQuestionArgs,
	ChatSendArgs,
	ChatTransport,
} from "./types";

export interface UseTransportChatDisplayOptions {
	sessionId: string | null;
	enabled?: boolean;
	fps?: number;
}

export interface TransportChatCommands {
	sendMessage: (input: ChatSendArgs) => Promise<unknown>;
	stop: () => Promise<unknown>;
	abort: () => Promise<unknown>;
	respondToApproval: (input: ChatApprovalArgs) => Promise<unknown>;
	respondToQuestion: (input: ChatQuestionArgs) => Promise<unknown>;
	respondToPlan: (input: ChatPlanArgs) => Promise<unknown>;
}

export type ChatDisplayResult<
	TMessage extends DisplayMessage,
	TDisplayState,
> = Partial<TDisplayState> & {
	messages: TMessage[];
	isConversationLoading: boolean;
	error: unknown;
	commands: TransportChatCommands;
};

export function useChatDisplay<
	TMessage extends DisplayMessage,
	TDisplayState = Record<string, unknown>,
>(
	transport: ChatTransport<TMessage, TDisplayState>,
	options: UseTransportChatDisplayOptions,
): ChatDisplayResult<TMessage, TDisplayState> {
	const { sessionId, enabled = true, fps = 4 } = options;
	const isQueryEnabled = enabled && Boolean(sessionId);
	const [commandError, setCommandError] = useState<unknown>(null);

	const snapshot = transport.useSnapshot({
		sessionId,
		enabled,
		fps,
	});

	const displayState = snapshot.displayState;
	const displayRecord = displayState as Record<string, unknown> | null;
	const runtimeErrorMessage =
		typeof displayRecord?.errorMessage === "string" &&
		(displayRecord.errorMessage as string).trim()
			? (displayRecord.errorMessage as string)
			: null;
	const currentMessage =
		(displayRecord?.currentMessage as {
			id?: string;
			role?: string;
			content?: unknown[];
		} | null) ?? null;
	const isRunning = Boolean(displayRecord?.isRunning);
	const historicalMessages = snapshot.historicalMessages;
	const latestAssistantErrorMessage = isRunning
		? null
		: findLatestAssistantErrorMessage(historicalMessages);

	const [optimisticUserMessage, setOptimisticUserMessage] =
		useState<TMessage | null>(null);
	const optimisticTextRef = useRef<string | null>(null);
	const optimisticIdRef = useRef<string | null>(null);
	const fileMessageCountAtSendRef = useRef<number | null>(null);

	useEffect(() => {
		if (!optimisticIdRef.current) return;

		const optimisticText = optimisticTextRef.current;
		const found = optimisticText
			? historicalMessages.some(
					(message) =>
						message.role === "user" &&
						message.content.some(
							(part) =>
								part.type === "text" &&
								typeof part.text === "string" &&
								part.text === optimisticText,
						),
				)
			: (() => {
					const currentFileMessageCount = countFileMessages(historicalMessages);
					return (
						fileMessageCountAtSendRef.current !== null &&
						currentFileMessageCount > fileMessageCountAtSendRef.current
					);
				})();
		if (!found) return;

		setOptimisticUserMessage(null);
		optimisticTextRef.current = null;
		optimisticIdRef.current = null;
		fileMessageCountAtSendRef.current = null;
	}, [historicalMessages]);

	const messages = useMemo(() => {
		const withOptimistic = optimisticUserMessage
			? [...historicalMessages, optimisticUserMessage]
			: historicalMessages;
		return withoutActiveTurnAssistantHistory({
			messages: withOptimistic,
			currentMessage,
			isRunning,
		});
	}, [historicalMessages, optimisticUserMessage, currentMessage, isRunning]);

	const clearOptimistic = useCallback(() => {
		setOptimisticUserMessage(null);
		optimisticTextRef.current = null;
		optimisticIdRef.current = null;
		fileMessageCountAtSendRef.current = null;
	}, []);

	const commands = useMemo<TransportChatCommands>(
		() => ({
			sendMessage: async (input: ChatSendArgs) => {
				if (!sessionId) {
					const error = new Error(
						"Chat session is still starting. Please retry in a moment.",
					);
					setCommandError(error);
					throw error;
				}
				setCommandError(null);

				const text =
					typeof input.payload?.content === "string"
						? input.payload.content
						: "";
				const files = input.payload?.files ?? [];
				const legacyImages = getLegacyImagePayload(input.payload);
				if (text || files.length > 0 || legacyImages.length > 0) {
					const optimisticId = `optimistic-${Date.now()}`;
					optimisticTextRef.current = text || null;
					optimisticIdRef.current = optimisticId;
					if (!text) {
						fileMessageCountAtSendRef.current =
							countFileMessages(historicalMessages);
					}
					const content: Array<Record<string, unknown>> = [];
					for (const file of files) {
						content.push({
							type: "file",
							data: file.data,
							mediaType: file.mediaType,
							filename: file.filename,
						});
					}
					for (const image of legacyImages) {
						content.push({
							type: "image",
							data: image.data,
							mimeType: image.mimeType,
						});
					}
					if (text) {
						content.push({ type: "text", text });
					}
					setOptimisticUserMessage({
						id: optimisticId,
						role: "user",
						content,
						createdAt: new Date(),
					} as unknown as TMessage);
				}

				try {
					return await transport.send(input);
				} catch (error) {
					setCommandError(error);
					clearOptimistic();
					throw error;
				}
			},
			stop: async () => {
				setCommandError(null);
				try {
					return await transport.stop();
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			abort: async () => transport.stop(),
			respondToApproval: async (input: ChatApprovalArgs) => {
				setCommandError(null);
				try {
					return await transport.respondToApproval(input);
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToQuestion: async (input: ChatQuestionArgs) => {
				setCommandError(null);
				try {
					return await transport.respondToQuestion(input);
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToPlan: async (input: ChatPlanArgs) => {
				setCommandError(null);
				try {
					return await transport.respondToPlan(input);
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[clearOptimistic, historicalMessages, sessionId, transport],
	);

	const base = (displayState ?? {}) as Partial<TDisplayState>;
	return Object.assign({}, base, {
		messages,
		isConversationLoading: isQueryEnabled && snapshot.isConversationLoading,
		error:
			runtimeErrorMessage ??
			latestAssistantErrorMessage ??
			snapshot.queryError ??
			commandError ??
			null,
		commands,
	}) as ChatDisplayResult<TMessage, TDisplayState>;
}

export type UseChatDisplayReturn<
	TMessage extends DisplayMessage,
	TDisplayState = Record<string, unknown>,
> = ReturnType<typeof useChatDisplay<TMessage, TDisplayState>>;
