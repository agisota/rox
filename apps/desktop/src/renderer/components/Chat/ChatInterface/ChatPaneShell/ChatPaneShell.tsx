/**
 * `ChatPaneShell` — the single, generic, presentational shell that owns the
 * ~80% orchestration body shared by the two ChatPane render shells (v2
 * workspace pane + legacy mosaic pane).
 *
 * It is generic over the backend message type (`TMessage extends
 * DisplayMessage`) and the backend display-state shape (`TDisplayState`). The
 * caller runs `useChatDisplay` with its own transport and passes the
 * already-built `ChatDisplayResult` in via `chat`. The shell renders the forked
 * child trees (ChatMessageList, ChatInputFooter, McpControls, the optional
 * standalone approval overlay) through render-props so each call site keeps its
 * own forked subtree.
 *
 * The two genuine divergences between the wrappers are routed through the
 * `session` / `turn` adapters and the optional `features`.
 */

import {
	extractTextsFromParts,
	selectContextUsage,
} from "@rox/shared/context-usage";
import { PromptInputProvider } from "@rox/ui/ai-elements/prompt-input";
import type { ChatStatus } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DisplayMessage } from "renderer/components/Chat/ChatInterface/transport/messageDisplayHelpers";
import { logger } from "renderer/lib/logger";
import { posthog } from "renderer/lib/posthog";
import type {
	ChatFooterFrame,
	ChatMessageFrame,
	ChatPaneShellProps,
	ChatSendMessageInput,
	UserMessageRestartRequest,
} from "./ChatPaneShell.types";
import { toOptimisticUserMessage } from "./utils/optimisticUserMessage";
import { toSendFailureMessage } from "./utils/sendMessage";
import {
	getVisibleMessagesWithPendingUserTurn,
	type PendingUserTurn,
	shouldClearPendingUserTurn,
} from "./utils/transientUserTurn";
import { uploadFiles } from "./utils/uploadFiles";

type HarnessFilePayload = {
	data: string;
	mediaType: string;
	filename?: string;
	uploaded?: boolean;
};

type InterruptedMessage<TMessage extends DisplayMessage> = {
	id: string;
	sourceMessageId: string;
	content: TMessage["content"];
};

type ChatAnalyticsProperties = Record<string, unknown>;

const AUTO_LAUNCH_MAX_RETRIES = 3;
const AUTO_LAUNCH_RETRY_DELAY_MS = 1500;

function toErrorMessage(error: unknown): string | null {
	if (!error) return null;
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	return "Неизвестная ошибка чата";
}

function cloneMessageContent<TMessage extends DisplayMessage>(
	content: TMessage["content"],
): TMessage["content"] {
	if (typeof structuredClone === "function") {
		return structuredClone(content);
	}
	try {
		return JSON.parse(JSON.stringify(content)) as TMessage["content"];
	} catch {
		return content.map((part) => ({ ...part }));
	}
}

function getLaunchConfigKey(config: {
	initialPrompt?: string;
	initialFiles?: unknown;
	metadata?: { model?: string };
	retryCount?: number;
}): string {
	return JSON.stringify({
		initialPrompt: config.initialPrompt ?? null,
		initialFiles: config.initialFiles ?? null,
		model: config.metadata?.model ?? null,
		retryCount: config.retryCount ?? null,
	});
}

export function ChatPaneShell<
	TMessage extends DisplayMessage,
	TDisplayState = Record<string, unknown>,
>({
	chat,
	sessionId,
	workspaceId,
	organizationId,
	cwd,
	isFocused,
	initialLaunchConfig,
	onConsumeLaunchConfig,
	onUserMessageSubmitted,
	onClearExternalError,
	availableModels,
	activeModel,
	selectedModel: _selectedModel,
	unresolvedModelId,
	onSelectModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingLevel,
	setThinkingLevel,
	slashCommands,
	resolveSlashCommandInput,
	session,
	turn,
	features,
	renderMessages,
	renderFooter,
	renderMcpControls,
}: ChatPaneShellProps<TMessage, TDisplayState>) {
	// `ChatDisplayResult` only statically guarantees messages / error /
	// commands; the backend-specific fields (currentMessage, isRunning,
	// activeTools, …) flow through the spread `Partial<TDisplayState>`. Read them
	// structurally through this record view — the transport contract documents
	// that the wrapper's snapshot carries them.
	const chatRecord = chat as unknown as Record<string, unknown>;
	const commands = chat.commands;
	const messages = chat.messages;
	const isConversationLoading = chat.isConversationLoading;
	const error = chat.error ?? null;
	const currentMessage = (chatRecord.currentMessage as TMessage | null) ?? null;
	const isRunning = Boolean(chatRecord.isRunning);
	const activeTools = chatRecord.activeTools;
	const toolInputBuffers = chatRecord.toolInputBuffers;
	const activeSubagents = chatRecord.activeSubagents;
	const pendingApproval =
		(chatRecord.pendingApproval as Record<string, unknown> | null) ?? null;
	const pendingPlanApproval =
		(chatRecord.pendingPlanApproval as Record<string, unknown> | null) ?? null;
	const pendingQuestion =
		(chatRecord.pendingQuestion as Record<string, unknown> | null) ?? null;

	const pendingApprovalToolCallId =
		typeof pendingApproval?.toolCallId === "string"
			? pendingApproval.toolCallId
			: null;
	const pendingPlanApprovalPlanId =
		typeof pendingPlanApproval?.planId === "string"
			? pendingPlanApproval.planId
			: null;

	const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>(
		undefined,
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [interruptedMessage, setInterruptedMessage] =
		useState<InterruptedMessage<TMessage> | null>(null);
	const [approvalResponsePending, setApprovalResponsePending] = useState(false);
	const [planResponsePending, setPlanResponsePending] = useState(false);
	const [questionResponsePending, setQuestionResponsePending] = useState(false);
	const [editingUserMessageId, setEditingUserMessageId] = useState<
		string | null
	>(null);
	const [pendingUserTurn, setPendingUserTurn] =
		useState<PendingUserTurn<TMessage> | null>(null);
	const currentMcpScopeRef = useRef<string | null>(null);
	const consumedLaunchConfigRef = useRef<string | null>(null);
	const autoLaunchInFlightRef = useRef<string | null>(null);
	const autoLaunchAttemptsRef = useRef<Record<string, number>>({});
	const autoLaunchSessionLockRef = useRef<Record<string, string | null>>({});
	const messagesLengthRef = useRef(0);
	const autoLaunchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const isAwaitingAssistant =
		isRunning || submitStatus === "submitted" || submitStatus === "streaming";
	const canAbort = Boolean(isRunning);

	const onBumpFooterScroll = features?.onBumpFooterScroll;
	const onAfterSend = features?.onAfterSend;
	const onQuestionAnswered = features?.onQuestionAnswered;
	const onQuestionAnswerFailed = features?.onQuestionAnswerFailed;

	const captureChatEvent = useCallback(
		(event: string, properties?: ChatAnalyticsProperties) => {
			posthog.capture(event, {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				...properties,
			});
		},
		[organizationId, sessionId, workspaceId],
	);

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const captureInterruptedMessage =
		useCallback((): InterruptedMessage<TMessage> | null => {
			if (!isRunning) return null;
			if (!currentMessage || currentMessage.role !== "assistant") return null;
			if (currentMessage.content.length === 0) return null;
			return {
				id: `interrupted:${currentMessage.id}`,
				sourceMessageId: currentMessage.id ?? "",
				content: cloneMessageContent<TMessage>(currentMessage.content),
			};
		}, [currentMessage, isRunning]);

	const stopActiveResponse = useCallback(async () => {
		clearRuntimeError();
		const snapshot = captureInterruptedMessage();
		try {
			await commands.stop();
		} catch (stopError) {
			setInterruptedMessage(null);
			setRuntimeErrorMessage(
				toErrorMessage(stopError) ?? "Не удалось остановить ответ",
			);
			return;
		}
		if (snapshot) {
			setInterruptedMessage(snapshot);
		}
		captureChatEvent("chat_turn_aborted", {
			model_id: activeModel?.id ?? null,
		});
	}, [
		activeModel?.id,
		captureChatEvent,
		captureInterruptedMessage,
		clearRuntimeError,
		commands,
		setRuntimeErrorMessage,
	]);

	// MCP scope-reset: when the session or cwd changes, clear the per-scope
	// transient state. (The actual MCP overview refresh lives in the wrapper's
	// useMcpUi; the shell only resets the orchestration body's local state.)
	useEffect(() => {
		const scopeKey = `${sessionId ?? "no-session"}::${cwd || "no-cwd"}`;
		if (currentMcpScopeRef.current === scopeKey) return;
		currentMcpScopeRef.current = scopeKey;
		setSubmitStatus(undefined);
		setRuntimeError(null);
		setInterruptedMessage(null);
		setPendingUserTurn(null);
		setEditingUserMessageId(null);
	}, [cwd, sessionId]);

	useEffect(() => {
		if (
			shouldClearPendingUserTurn({
				messages,
				pendingUserTurn,
				isAwaitingAssistant,
			})
		) {
			setPendingUserTurn(null);
		}
	}, [isAwaitingAssistant, messages, pendingUserTurn]);

	useEffect(() => {
		if (!editingUserMessageId) return;
		if (messages.some((message) => message.id === editingUserMessageId)) return;
		setEditingUserMessageId(null);
	}, [editingUserMessageId, messages]);

	const visibleMessages = useMemo(() => {
		return getVisibleMessagesWithPendingUserTurn({
			messages,
			pendingUserTurn,
			isAwaitingAssistant,
		});
	}, [isAwaitingAssistant, messages, pendingUserTurn]);

	// F42: live context-usage ring. Estimated from displayed conversation text
	// via the shared cross-platform selector so every surface agrees for the same
	// conversation + model; the window comes from the active model.
	const contextUsage = useMemo(
		() =>
			selectContextUsage(
				visibleMessages.flatMap((message) =>
					extractTextsFromParts(message.content),
				),
				activeModel?.id,
			),
		[visibleMessages, activeModel?.id],
	);

	useEffect(() => {
		if (isRunning) {
			setSubmitStatus((previousStatus) =>
				previousStatus === "submitted" || previousStatus === "streaming"
					? "streaming"
					: previousStatus,
			);
			return;
		}
		setSubmitStatus(undefined);
	}, [isRunning]);

	// Scroll the (v2) footer overlay into view whenever the pending question or
	// approval band appears, changes, or disappears.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pendingQuestion is an intentional re-run trigger
	useEffect(() => {
		onBumpFooterScroll?.();
	}, [onBumpFooterScroll, pendingQuestion]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: pendingApprovalToolCallId is an intentional re-run trigger
	useEffect(() => {
		onBumpFooterScroll?.();
	}, [onBumpFooterScroll, pendingApprovalToolCallId]);

	useEffect(() => {
		messagesLengthRef.current = messages?.length ?? 0;
	}, [messages]);

	const handleSend = useCallback(
		async (payload: { content: string; files?: HarnessFilePayload[] }) => {
			let content = payload.content.trim();

			const isSlashCommand = content.startsWith("/");
			const slashCommandResult = await resolveSlashCommandInput(content);
			if (slashCommandResult.handled) {
				setSubmitStatus(undefined);
				return;
			}
			content = slashCommandResult.nextText.trim();

			if (!content && (!payload.files || payload.files.length === 0)) {
				setSubmitStatus(undefined);
				return;
			}
			setInterruptedMessage(null);
			setSubmitStatus("submitted");
			clearRuntimeError();
			onClearExternalError?.();

			let preparedFiles = payload.files;
			let targetSessionId = sessionId;
			let optimisticMessage: TMessage | null = null;
			// The upload branch already resolves (creates + ensures) a session; track
			// that so the send below reuses it instead of re-running the adapter's
			// create→ensure ladder a second time (an extra round-trip the
			// pre-shell code never made for a single send).
			let sessionResolved = false;
			try {
				if (preparedFiles?.some((file) => file.uploaded === false)) {
					// Files need a real session before they can be uploaded.
					targetSessionId =
						await session.resolveSessionForSend(targetSessionId);
					sessionResolved = true;
					const uploadedFiles = await uploadFiles(
						targetSessionId,
						preparedFiles.map((file) => ({
							type: "file" as const,
							url: file.data,
							mediaType: file.mediaType,
							filename: file.filename,
						})),
					);
					preparedFiles = uploadedFiles.map((file) => ({
						data: file.url,
						mediaType: file.mediaType,
						filename: file.filename,
						uploaded: true,
					}));
				}

				const sendInput: ChatSendMessageInput = {
					payload: {
						content,
						...(preparedFiles?.length
							? {
									files: preparedFiles.map(({ data, filename, mediaType }) => ({
										data,
										mediaType,
										filename,
									})),
								}
							: {}),
					},
					metadata: {
						model: activeModel?.id,
						thinkingLevel,
						permissionMode,
					},
				};

				const resolvedSessionId = sessionResolved
					? (targetSessionId as string)
					: await session.resolveSessionForSend(targetSessionId);
				targetSessionId = resolvedSessionId;

				if (sessionId && resolvedSessionId === sessionId) {
					await commands.sendMessage(sendInput);
				} else {
					optimisticMessage = toOptimisticUserMessage<TMessage>(sendInput);
					if (optimisticMessage) {
						setPendingUserTurn({
							kind: "append",
							message: optimisticMessage,
						});
					}
					await turn.sendToSession(resolvedSessionId, sendInput);
				}
				if (content) {
					onUserMessageSubmitted?.(content);
				}
			} catch (sendError) {
				if (optimisticMessage) {
					const failedMessage = optimisticMessage;
					setPendingUserTurn((previousTurn) =>
						previousTurn?.kind === "append" &&
						previousTurn.message.id === failedMessage.id
							? null
							: previousTurn,
					);
				}
				const sendErrorMessage = toSendFailureMessage(sendError);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (sendError instanceof Error) throw sendError;
				throw new Error(sendErrorMessage);
			}

			captureChatEvent("chat_message_sent", {
				session_id: targetSessionId,
				model_id: activeModel?.id ?? null,
				mention_count: 0,
				attachment_count: payload.files?.length ?? 0,
				is_slash_command: isSlashCommand,
				message_length: content.length,
				turn_number: (messages?.length ?? 0) + 1,
			});

			onAfterSend?.();
		},
		[
			activeModel?.id,
			captureChatEvent,
			clearRuntimeError,
			commands,
			messages?.length,
			onAfterSend,
			onClearExternalError,
			onUserMessageSubmitted,
			permissionMode,
			resolveSlashCommandInput,
			session,
			sessionId,
			setRuntimeErrorMessage,
			thinkingLevel,
			turn,
		],
	);

	useEffect(() => {
		if (!initialLaunchConfig) return;

		const launchConfigKey = getLaunchConfigKey(initialLaunchConfig);
		const attemptAutoLaunch = async (): Promise<void> => {
			if (consumedLaunchConfigRef.current === launchConfigKey) return;
			if (autoLaunchInFlightRef.current === launchConfigKey) return;

			const prompt = initialLaunchConfig.initialPrompt?.trim();
			const launchFiles = initialLaunchConfig.initialFiles;
			if (!prompt && !launchFiles?.length) {
				consumedLaunchConfigRef.current = launchConfigKey;
				delete autoLaunchAttemptsRef.current[launchConfigKey];
				delete autoLaunchSessionLockRef.current[launchConfigKey];
				onConsumeLaunchConfig?.();
				return;
			}

			const currentSessionKey = sessionId ?? null;
			const lockedSession = autoLaunchSessionLockRef.current[launchConfigKey];
			if (lockedSession === undefined) {
				autoLaunchSessionLockRef.current[launchConfigKey] = currentSessionKey;
			} else if (lockedSession !== currentSessionKey) {
				// Don't send launch retries into a different user-selected session.
				return;
			}

			const previousAttempts =
				autoLaunchAttemptsRef.current[launchConfigKey] ?? 0;
			const retryLimit =
				initialLaunchConfig.retryCount ?? AUTO_LAUNCH_MAX_RETRIES;
			if (previousAttempts >= retryLimit) return;

			autoLaunchAttemptsRef.current[launchConfigKey] = previousAttempts + 1;
			autoLaunchInFlightRef.current = launchConfigKey;
			if (autoLaunchRetryTimerRef.current) {
				clearTimeout(autoLaunchRetryTimerRef.current);
				autoLaunchRetryTimerRef.current = null;
			}

			clearRuntimeError();
			onClearExternalError?.();
			setSubmitStatus("submitted");

			const modelId = initialLaunchConfig.metadata?.model ?? activeModel?.id;
			const sendInput: ChatSendMessageInput = {
				payload: {
					content: prompt ?? "",
					files: launchFiles,
				},
				metadata: {
					model: modelId,
					thinkingLevel,
					permissionMode,
				},
			};

			try {
				const lockedTarget = autoLaunchSessionLockRef.current[launchConfigKey];
				const targetSessionId = await session.resolveSessionForSend(
					lockedTarget ?? null,
				);
				autoLaunchSessionLockRef.current[launchConfigKey] = targetSessionId;
				if (sessionId && targetSessionId === sessionId) {
					await commands.sendMessage(sendInput);
				} else {
					await turn.sendToSession(targetSessionId, sendInput);
				}
				if (prompt) {
					onUserMessageSubmitted?.(prompt);
				}

				autoLaunchInFlightRef.current = null;
				consumedLaunchConfigRef.current = launchConfigKey;
				delete autoLaunchAttemptsRef.current[launchConfigKey];
				delete autoLaunchSessionLockRef.current[launchConfigKey];
				onConsumeLaunchConfig?.();

				captureChatEvent("chat_message_sent", {
					session_id: targetSessionId,
					model_id: modelId ?? null,
					mention_count: 0,
					attachment_count: launchFiles?.length ?? 0,
					is_slash_command: false,
					message_length: prompt?.length ?? 0,
					turn_number: messagesLengthRef.current + 1,
					send_trigger: "launch-config",
				});
			} catch (launchError) {
				autoLaunchInFlightRef.current = null;

				const sendErrorMessage = toSendFailureMessage(launchError);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				logger.debug("[chat] auto launch send failed", launchError);

				const currentAttempts =
					autoLaunchAttemptsRef.current[launchConfigKey] ??
					previousAttempts + 1;
				if (currentAttempts < retryLimit) {
					autoLaunchRetryTimerRef.current = setTimeout(() => {
						void attemptAutoLaunch();
					}, AUTO_LAUNCH_RETRY_DELAY_MS);
				}
			}
		};
		void attemptAutoLaunch();

		return () => {
			if (autoLaunchRetryTimerRef.current) {
				clearTimeout(autoLaunchRetryTimerRef.current);
				autoLaunchRetryTimerRef.current = null;
			}
		};
	}, [
		activeModel?.id,
		captureChatEvent,
		clearRuntimeError,
		commands,
		initialLaunchConfig,
		onClearExternalError,
		onConsumeLaunchConfig,
		onUserMessageSubmitted,
		permissionMode,
		session,
		sessionId,
		setRuntimeErrorMessage,
		thinkingLevel,
		turn,
	]);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			await stopActiveResponse();
		},
		[stopActiveResponse],
	);

	const restartFromUserMessage = useCallback(
		async (
			request: UserMessageRestartRequest<TMessage>,
			options?: { trigger?: "edit" | "resend" },
		) => {
			if (!sessionId) {
				throw new Error("Сессия чата ещё запускается. Повторите попытку.");
			}

			setInterruptedMessage(null);
			setPendingUserTurn(null);
			setSubmitStatus("submitted");
			clearRuntimeError();
			onClearExternalError?.();

			const optimisticMessage = toOptimisticUserMessage<TMessage>({
				payload: request.payload,
				metadata: {
					model: activeModel?.id,
					thinkingLevel,
					permissionMode,
				},
			});
			if (optimisticMessage) {
				setPendingUserTurn({
					kind: "restart",
					prefixMessages: request.prefixMessages,
					message: optimisticMessage,
				});
			}

			try {
				await turn.restartFromMessage({
					sessionId,
					messageId: request.messageId,
					payload: request.payload,
					metadata: {
						model: activeModel?.id,
						thinkingLevel,
						permissionMode,
					},
				});
				setEditingUserMessageId(null);
				if (request.payload.content) {
					onUserMessageSubmitted?.(request.payload.content);
				}
				captureChatEvent("chat_message_sent", {
					session_id: sessionId,
					model_id: activeModel?.id ?? null,
					mention_count: 0,
					attachment_count: request.payload.files?.length ?? 0,
					is_slash_command: false,
					message_length: request.payload.content.length,
					turn_number: (messages?.length ?? 0) + 1,
					send_trigger: options?.trigger ?? "resend",
					restarted_from_message_id: request.messageId,
				});

				onAfterSend?.();
			} catch (restartError) {
				setPendingUserTurn(null);
				const sendErrorMessage = toSendFailureMessage(restartError);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (restartError instanceof Error) throw restartError;
				throw new Error(sendErrorMessage);
			}
		},
		[
			activeModel?.id,
			captureChatEvent,
			clearRuntimeError,
			messages,
			onAfterSend,
			onClearExternalError,
			onUserMessageSubmitted,
			permissionMode,
			sessionId,
			setRuntimeErrorMessage,
			thinkingLevel,
			turn,
		],
	);

	const handleResendUserMessage = useCallback(
		async (request: UserMessageRestartRequest<TMessage>) => {
			await restartFromUserMessage(request, { trigger: "resend" });
		},
		[restartFromUserMessage],
	);
	const handleSubmitEditedUserMessage = useCallback(
		async (request: UserMessageRestartRequest<TMessage>) => {
			await restartFromUserMessage(request, { trigger: "edit" });
		},
		[restartFromUserMessage],
	);
	const handleCancelEditUserMessage = useCallback(() => {
		setEditingUserMessageId(null);
	}, []);

	const handleApprovalResponse = useCallback(
		async (decision: "approve" | "decline" | "always_allow_category") => {
			if (!pendingApprovalToolCallId) return;
			clearRuntimeError();
			setApprovalResponsePending(true);
			try {
				await commands.respondToApproval({
					payload: { decision },
				});
			} finally {
				setApprovalResponsePending(false);
			}
		},
		[clearRuntimeError, commands, pendingApprovalToolCallId],
	);
	const handlePlanResponse = useCallback(
		async (response: {
			action: "approved" | "rejected";
			feedback?: string;
		}) => {
			if (!pendingPlanApprovalPlanId) return;
			clearRuntimeError();
			setPlanResponsePending(true);
			try {
				const feedback = response.feedback?.trim();
				await commands.respondToPlan({
					payload: {
						planId: pendingPlanApprovalPlanId,
						response: {
							action: response.action,
							...(feedback ? { feedback } : {}),
						},
					},
				});
			} finally {
				setPlanResponsePending(false);
			}
		},
		[clearRuntimeError, commands, pendingPlanApprovalPlanId],
	);
	const handleQuestionResponse = useCallback(
		async (questionId: string, answer: string) => {
			const trimmedQuestionId = questionId.trim();
			const trimmedAnswer = answer.trim();
			if (!trimmedQuestionId || !trimmedAnswer) return;
			clearRuntimeError();
			onBumpFooterScroll?.();
			setQuestionResponsePending(true);
			// Legacy paneStatus + answeredQuestionId optimism, gated via features.
			onQuestionAnswered?.(trimmedQuestionId);
			try {
				await commands.respondToQuestion({
					payload: {
						questionId: trimmedQuestionId,
						answer: trimmedAnswer,
					},
				});
			} catch (questionError) {
				onQuestionAnswerFailed?.(trimmedQuestionId);
				throw questionError;
			} finally {
				setQuestionResponsePending(false);
			}
		},
		[
			clearRuntimeError,
			commands,
			onBumpFooterScroll,
			onQuestionAnswered,
			onQuestionAnswerFailed,
		],
	);

	const errorMessage = runtimeError ?? toErrorMessage(error);

	const messageFrame: ChatMessageFrame<TMessage> = {
		messages: visibleMessages,
		currentMessage: currentMessage ?? null,
		interruptedMessage,
		isFocused,
		isRunning: canAbort,
		isConversationLoading,
		isAwaitingAssistant,
		workspaceId,
		sessionId,
		organizationId,
		workspaceCwd: cwd,
		activeTools,
		toolInputBuffers,
		activeSubagents,
		pendingApproval,
		isApprovalSubmitting: approvalResponsePending,
		onApprovalRespond: handleApprovalResponse,
		pendingPlanApproval,
		isPlanSubmitting: planResponsePending,
		onPlanRespond: handlePlanResponse,
		editingUserMessageId,
		isEditSubmitting: isAwaitingAssistant,
		onStartEditUserMessage: setEditingUserMessageId,
		onCancelEditUserMessage: handleCancelEditUserMessage,
		onSubmitEditedUserMessage: handleSubmitEditedUserMessage,
		onRestartUserMessage: handleResendUserMessage,
	};

	const footerFrame: ChatFooterFrame = {
		error: errorMessage,
		canAbort,
		submitStatus,
		availableModels,
		selectedModel: activeModel,
		setSelectedModel: onSelectModel,
		modelSelectorOpen,
		setModelSelectorOpen,
		unresolvedModelId,
		permissionMode,
		setPermissionMode,
		thinkingLevel,
		setThinkingLevel,
		slashCommands,
		usedTokens: contextUsage.usedTokens,
		maxTokens: contextUsage.maxTokens,
		sessionId,
		cwd,
		isFocused,
		onError: setRuntimeErrorMessage,
		onSend: handleSend,
		onSubmitStart: () => setSubmitStatus("submitted"),
		onStop: handleStop,
		footerScrollTrigger: features?.footerScrollTrigger,
		pendingQuestion,
		isQuestionSubmitting: questionResponsePending,
		onQuestionRespond: handleQuestionResponse,
		onQuestionCancel: () => {
			onBumpFooterScroll?.();
			void stopActiveResponse();
		},
	};

	return (
		<PromptInputProvider initialInput={initialLaunchConfig?.draftInput}>
			{features?.draftSaver}
			<div className="relative flex h-full w-full flex-col bg-background">
				{renderMessages(messageFrame)}
				{renderMcpControls()}
				{features?.renderApprovalOverlay
					? features.renderApprovalOverlay(pendingApproval, {
							isSubmitting: approvalResponsePending,
							onRespond: handleApprovalResponse,
						})
					: null}
				{renderFooter(footerFrame)}
			</div>
		</PromptInputProvider>
	);
}
