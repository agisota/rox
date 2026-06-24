import { chatServiceTrpc } from "@rox/chat/client";
import type { AppRouter } from "@rox/host-service";
import {
	PromptInputAttachment,
	type PromptInputMessage,
	PromptInputProvider,
	useProviderAttachments,
} from "@rox/ui/ai-elements/prompt-input";
import {
	AnimatedPresence,
	motionSpring,
	useShouldAnimate,
} from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { workspaceTrpc } from "@rox/workspace-client";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChatStatus } from "ai";
import { motion } from "framer-motion";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	getDesktopChatModelOptions,
	isDesktopChatDevMode,
} from "renderer/lib/dev-chat";
import { logger } from "renderer/lib/logger";
import { posthog } from "renderer/lib/posthog";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
import { usePermissionModePreference } from "../../hooks/usePermissionModePreference";
import {
	type UseChatDisplayReturn,
	useChatDisplay,
} from "../../hooks/useWorkspaceChatDisplay";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { ChatMessageList } from "./components/ChatMessageList";
import type { UserMessageRestartRequest } from "./components/ChatMessageList/ChatMessageList.types";
import { PendingApprovalMessage } from "./components/ChatMessageList/components/PendingApprovalMessage/PendingApprovalMessage";
import { McpControls } from "./components/McpControls";
import { resolveSelectableModels } from "./components/ModelPicker/utils/selectableModels";
import { useMcpUi } from "./hooks/useMcpUi";
import { useOptimisticUpload } from "./hooks/useOptimisticUpload";
import { useSlashCommandExecutor } from "./hooks/useSlashCommandExecutor";
import type { ChatPaneInterfaceProps } from "./types";
import { toOptimisticUserMessage } from "./utils/optimisticUserMessage";
import {
	type ChatSendMessageInput,
	toSendFailureMessage,
} from "./utils/sendMessage";
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

function ChatUploadFooter({
	sessionId,
	workspaceId,
	onError,
	onSend,
	...footerProps
}: {
	sessionId: string | null;
	workspaceId: string;
	onError: (message: string) => void;
	onSend: (payload: {
		content: string;
		files?: HarnessFilePayload[];
	}) => void | Promise<void>;
} & Omit<React.ComponentProps<typeof ChatInputFooter>, "onSend">) {
	const attachments = useProviderAttachments();
	const { entries, getUploadedFiles, isUploading } = useOptimisticUpload({
		sessionId,
		attachmentFiles: attachments.files,
		removeAttachment: attachments.remove,
		onError,
	});

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			const files = sessionId
				? (() => {
						const { files: uploadedFiles, ready } = getUploadedFiles();
						if (!ready) return null;
						return uploadedFiles.map((file) => ({
							data: file.url,
							mediaType: file.mediaType,
							filename: file.filename,
							uploaded: true,
						}));
					})()
				: (message.files ?? []).map((file) => ({
						data: file.url,
						mediaType: file.mediaType,
						filename: file.filename,
						uploaded: false,
					}));
			if (files === null) return;

			return onSend({
				content: message.text,
				files: files.length > 0 ? files : undefined,
			});
		},
		[getUploadedFiles, onSend, sessionId],
	);

	const renderAttachment = useCallback(
		(file: { id: string; type: "file"; url: string; mediaType: string }) => {
			if (!sessionId) {
				return <PromptInputAttachment data={file} />;
			}
			const entry = entries.get(file.id);
			const loading = entry?.uploading ?? !entries.has(file.id);
			return <PromptInputAttachment data={file} loading={loading} />;
		},
		[entries, sessionId],
	);

	return (
		<ChatInputFooter
			{...footerProps}
			workspaceId={workspaceId}
			submitDisabled={sessionId ? isUploading : false}
			renderAttachment={renderAttachment}
			onSend={handleSend}
		/>
	);
}

function useAvailableModels(): {
	models: ModelOption[];
	defaultModel: ModelOption | null;
} {
	const localModels = getDesktopChatModelOptions();
	const { data } = useQuery({
		queryKey: ["chat", "models"],
		queryFn: () => apiTrpcClient.chat.getModels.query(),
		enabled: !isDesktopChatDevMode(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const models = localModels.length > 0 ? localModels : (data?.models ?? []);
	return { models, defaultModel: models[0] ?? null };
}

function toErrorMessage(error: unknown): string | null {
	if (!error) return null;
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	return "Неизвестная ошибка чата";
}

const AUTO_LAUNCH_MAX_RETRIES = 3;
const AUTO_LAUNCH_RETRY_DELAY_MS = 1500;

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

type ChatShareMessage = {
	id: string;
	role: string;
	content: unknown[];
	createdAt?: string;
};

type InterruptedMessage = {
	id: string;
	sourceMessageId: string;
	content: ChatMessage["content"];
};

type ChatAnalyticsProperties = Record<string, unknown>;

function cloneMessageContent(
	content: ChatMessage["content"],
): ChatMessage["content"] {
	if (typeof structuredClone === "function") {
		return structuredClone(content);
	}
	try {
		return JSON.parse(JSON.stringify(content)) as ChatMessage["content"];
	} catch {
		return content.map((part) => ({ ...part }));
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toShareCreatedAt(message: ChatMessage): string | undefined {
	if (!isRecord(message)) return undefined;

	const createdAt = message.createdAt;
	if (createdAt instanceof Date) return createdAt.toISOString();
	if (typeof createdAt === "string") return createdAt;
	return undefined;
}

function toShareContent(content: ChatMessage["content"]): unknown[] {
	return cloneMessageContent(content).map((part) => part as unknown);
}

function toShareMessage(message: ChatMessage): ChatShareMessage {
	const createdAt = toShareCreatedAt(message);
	const shareMessage: ChatShareMessage = {
		id: message.id,
		role: message.role,
		content: toShareContent(message.content),
	};

	if (createdAt) {
		shareMessage.createdAt = createdAt;
	}

	return shareMessage;
}

function getShareMessages(messages: ChatMessage[]): ChatShareMessage[] {
	const seenMessageIds = new Set<string>();
	const shareMessages: ChatShareMessage[] = [];

	for (const message of messages) {
		if (seenMessageIds.has(message.id)) continue;
		seenMessageIds.add(message.id);
		if (message.content.length === 0) continue;
		shareMessages.push(toShareMessage(message));
	}

	return shareMessages;
}

function getTextPreviewFromContent(content: ChatMessage["content"]): string {
	const fragments: string[] = [];

	for (const part of content) {
		if (typeof part === "string") {
			fragments.push(part);
			continue;
		}
		if (!isRecord(part)) continue;

		const partRecord = part as unknown as Record<string, unknown>;
		const text = partRecord.text ?? partRecord.content;
		if (typeof text === "string") {
			fragments.push(text);
		}
	}

	return fragments.join(" ").trim();
}

function getChatShareTitle(messages: ChatMessage[]): string | undefined {
	const firstUserMessage = messages.find((message) => message.role === "user");
	if (!firstUserMessage) return undefined;

	const preview = getTextPreviewFromContent(firstUserMessage.content);
	if (!preview) return undefined;
	return preview.length > 80 ? `${preview.slice(0, 77)}...` : preview;
}

function getLaunchConfigKey(
	config: NonNullable<ChatPaneInterfaceProps["initialLaunchConfig"]>,
): string {
	return JSON.stringify({
		initialPrompt: config.initialPrompt ?? null,
		initialFiles: config.initialFiles ?? null,
		model: config.metadata?.model ?? null,
		retryCount: config.retryCount ?? null,
	});
}

export function ChatPaneInterface({
	sessionId,
	initialLaunchConfig,
	onConsumeLaunchConfig,
	workspaceId,
	organizationId,
	cwd,
	isFocused,
	getOrCreateSession,
	onResetSession,
	onUserMessageSubmitted,
}: ChatPaneInterfaceProps) {
	const { models: catalogModels, defaultModel } = useAvailableModels();
	const { data: customProviderConfig } =
		chatServiceTrpc.auth.getCustomProviderConfig.useQuery();
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	// Live-refetch the custom provider's `/v1/models` when the picker opens so a
	// model added provider-side appears without re-saving in Settings. The refresh
	// is owned HERE (not inside the picker) so the SAME superset feeds the picker
	// display, the active-model lookup, and the sent turn — otherwise a freshly
	// discovered selection (id `rox-custom/<modelId>`) would miss the lookup and
	// the composer would silently snap back to the default house model ("ROX R1").
	const discoverCustomModels =
		chatServiceTrpc.auth.discoverCustomProviderModels.useMutation();
	const [liveCustomModelIds, setLiveCustomModelIds] = useState<string[]>([]);
	const customProviderBaseUrl = customProviderConfig?.baseUrl;
	const customProviderHasApiKey = customProviderConfig?.hasApiKey ?? false;
	const runDiscoverCustomModels = discoverCustomModels.mutateAsync;
	useEffect(() => {
		if (!modelSelectorOpen) return;
		if (!customProviderBaseUrl || !customProviderHasApiKey) {
			setLiveCustomModelIds([]);
			return;
		}
		let cancelled = false;
		void runDiscoverCustomModels({ baseUrl: customProviderBaseUrl })
			.then((result) => {
				if (cancelled) return;
				setLiveCustomModelIds(result.models.map((model) => model.id));
			})
			.catch(() => {
				// Discovery is best-effort; keep the persisted list on failure.
			});
		return () => {
			cancelled = true;
		};
	}, [
		modelSelectorOpen,
		customProviderBaseUrl,
		customProviderHasApiKey,
		runDiscoverCustomModels,
	]);
	// The picker offers the catalog plus the user's configured custom
	// OpenAI-compatible models (persisted + live-refetched), so the active-model
	// lookup resolves against that same superset (cache-first: persisted renders
	// immediately, live ids merge on top).
	const availableModels = useMemo(
		() =>
			resolveSelectableModels({
				models: catalogModels,
				customProviderConfig,
				discoveredModelIds: liveCustomModelIds,
			}),
		[catalogModels, customProviderConfig, liveCustomModelIds],
	);
	const selectedModelId = useChatPreferencesStore(
		(state) => state.selectedModelId,
	);
	const setSelectedModelId = useChatPreferencesStore(
		(state) => state.setSelectedModelId,
	);
	const selectedModel =
		availableModels.find((model) => model.id === selectedModelId) ?? null;
	const activeModel = selectedModel ?? defaultModel;
	const thinkingLevel = useChatPreferencesStore((state) => state.thinkingLevel);
	const setThinkingLevel = useChatPreferencesStore(
		(state) => state.setThinkingLevel,
	);
	// Permission mode is now persisted (and defaults to the safer "default" /
	// manual-confirm) instead of being hardwired to "bypassPermissions" in
	// component state — closing the desktop-agent security gap noted in the
	// surfaces spec (it previously reset every session). The composer selector
	// already lets the user change it. Wiring the chosen mode through the turn
	// metadata so the harness enforces it requires extending the shared
	// host-service chat schema + runtime (out of this surface's scope — tracked
	// as needsShared).
	const [permissionMode, setPermissionMode] = usePermissionModePreference();
	const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>(
		undefined,
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [interruptedMessage, setInterruptedMessage] =
		useState<InterruptedMessage | null>(null);
	const [approvalResponsePending, setApprovalResponsePending] = useState(false);
	const [planResponsePending, setPlanResponsePending] = useState(false);
	const [questionResponsePending, setQuestionResponsePending] = useState(false);
	const [footerScrollTrigger, setFooterScrollTrigger] = useState(0);
	const bumpFooterScroll = useCallback(
		() => setFooterScrollTrigger((n) => n + 1),
		[],
	);
	const [editingUserMessageId, setEditingUserMessageId] = useState<
		string | null
	>(null);
	const [pendingUserTurn, setPendingUserTurn] =
		useState<PendingUserTurn | null>(null);
	const currentMcpScopeRef = useRef<string | null>(null);
	const consumedLaunchConfigRef = useRef<string | null>(null);
	const autoLaunchInFlightRef = useRef<string | null>(null);
	const autoLaunchAttemptsRef = useRef<Record<string, number>>({});
	const autoLaunchSessionLockRef = useRef<Record<string, string | null>>({});
	const messagesLengthRef = useRef(0);
	const autoLaunchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const workspaceTrpcUtils = workspaceTrpc.useUtils();
	const { copyToClipboard } = useCopyToClipboard();
	const [isSharingConversation, setIsSharingConversation] = useState(false);
	const [lastSharedConversationUrl, setLastSharedConversationUrl] = useState<
		string | null
	>(null);
	const sendMessageMutation = workspaceTrpc.chat.sendMessage.useMutation();
	const restartFromMessageMutation =
		workspaceTrpc.chat.restartFromMessage.useMutation();
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

	// Memoize the select mapper so React Query can preserve the result's
	// identity across polls — without this, every render produces a new
	// mapper, every poll produces a new array, and every consumer of
	// `slashCommands` rerenders even when nothing has changed.
	const selectSlashCommands = useCallback(
		(
			commands: NonNullable<
				inferRouterOutputs<AppRouter>["chat"]["getSlashCommands"]
			>,
		) =>
			commands.map((command) => ({
				...command,
				kind:
					command.kind === "builtin"
						? ("builtin" as const)
						: ("custom" as const),
				source:
					command.kind === "builtin"
						? ("builtin" as const)
						: ("project" as const),
			})),
		[],
	);

	const { data: slashCommands = [] } =
		workspaceTrpc.chat.getSlashCommands.useQuery(
			{ workspaceId },
			{ select: selectSlashCommands },
		);

	const chat = useChatDisplay({
		sessionId,
		workspaceId,
		enabled: Boolean(sessionId),
	});
	const {
		commands,
		messages,
		currentMessage,
		isRunning = false,
		isConversationLoading = false,
		error = null,
		activeTools,
		toolInputBuffers,
		activeSubagents,
		pendingApproval = null,
		pendingPlanApproval = null,
		pendingQuestion = null,
	} = chat;
	const isAwaitingAssistant =
		isRunning || submitStatus === "submitted" || submitStatus === "streaming";

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const handleSelectModel = useCallback(
		(model: React.SetStateAction<ModelOption | null>) => {
			const nextSelectedModel =
				typeof model === "function" ? model(selectedModel) : model;
			if (!nextSelectedModel) {
				setSelectedModelId(null);
				return;
			}
			captureChatEvent("chat_model_changed", {
				model_id: nextSelectedModel.id,
				model_name: nextSelectedModel.name,
				trigger: "picker",
			});
			setSelectedModelId(nextSelectedModel.id);
		},
		[captureChatEvent, selectedModel, setSelectedModelId],
	);

	const sendMessageToSession = useCallback(
		async (targetSessionId: string, input: ChatSendMessageInput) => {
			// Optimistic state for this path lives in `pendingUserTurn` (set by
			// the caller in handleSend), NOT in the snapshot cache. Writing to
			// the cache here was racing with the 4fps snapshot polls — a poll
			// could resolve mid-mutation with the harness's pre-message state
			// and clobber the optimistic write, making the user message vanish
			// briefly. The pendingUserTurn local state is merged in via
			// getVisibleMessagesWithPendingUserTurn so it survives stale polls.
			await sendMessageMutation.mutateAsync({
				sessionId: targetSessionId,
				workspaceId,
				...input,
			});
		},
		[sendMessageMutation, workspaceId],
	);

	const canAbort = Boolean(isRunning);
	const loadMcpOverview = useCallback(
		async (_rootCwd: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return workspaceTrpcUtils.chat.getMcpOverview.fetch({
				sessionId,
				workspaceId,
			});
		},
		[workspaceTrpcUtils.chat.getMcpOverview, sessionId, workspaceId],
	);
	const mcpUi = useMcpUi({
		cwd,
		loadOverview: loadMcpOverview,
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onTrackEvent: captureChatEvent,
	});
	const resetMcpUi = mcpUi.resetUi;
	const refreshMcpOverview = mcpUi.refreshOverview;

	const captureInterruptedMessage =
		useCallback((): InterruptedMessage | null => {
			if (!isRunning) return null;
			if (!currentMessage || currentMessage.role !== "assistant") return null;
			if (currentMessage.content.length === 0) return null;
			return {
				id: `interrupted:${currentMessage.id}`,
				sourceMessageId: currentMessage.id,
				content: cloneMessageContent(currentMessage.content),
			};
		}, [currentMessage, isRunning]);

	const stopActiveResponse = useCallback(async () => {
		clearRuntimeError();
		const snapshot = captureInterruptedMessage();
		try {
			await commands.stop();
		} catch (error) {
			setInterruptedMessage(null);
			setRuntimeErrorMessage(
				toErrorMessage(error) ?? "Не удалось остановить ответ",
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

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		sessionId,
		workspaceId,
		cwd,
		availableModels,
		canAbort,
		onResetSession,
		onStopActiveResponse: () => {
			void stopActiveResponse();
		},
		onSelectModel: handleSelectModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: mcpUi.showOverview,
		loadMcpOverview,
		onTrackEvent: captureChatEvent,
	});

	useEffect(() => {
		const scopeKey = `${sessionId ?? "no-session"}::${cwd || "no-cwd"}`;
		if (currentMcpScopeRef.current === scopeKey) return;
		currentMcpScopeRef.current = scopeKey;
		setSubmitStatus(undefined);
		setRuntimeError(null);
		setInterruptedMessage(null);
		setPendingUserTurn(null);
		setEditingUserMessageId(null);
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [cwd, refreshMcpOverview, resetMcpUi, sessionId]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId resets the copied share state between sessions
	useEffect(() => {
		setLastSharedConversationUrl(null);
		setIsSharingConversation(false);
	}, [sessionId]);

	const handleShareConversation = useCallback(async () => {
		if (!sessionId) {
			toast.error("Сессия чата ещё запускается.");
			return;
		}

		const sourceMessages = currentMessage
			? [...visibleMessages, currentMessage]
			: visibleMessages;
		const shareMessages = getShareMessages(sourceMessages);
		if (shareMessages.length === 0) {
			toast.error("Нечего публиковать.");
			return;
		}

		clearRuntimeError();
		setIsSharingConversation(true);
		try {
			const result = await apiTrpcClient.share.publishChatSession.mutate({
				sessionId,
				title: getChatShareTitle(sourceMessages),
				messages: shareMessages,
			});
			await copyToClipboard(result.url);
			setLastSharedConversationUrl(result.url);
			toast.success("Ссылка скопирована");
			captureChatEvent("chat_session_shared", {
				message_count: shareMessages.length,
			});
		} catch (error) {
			const message = toErrorMessage(error) ?? "Не удалось поделиться диалогом";
			setRuntimeErrorMessage(message);
			toast.error(message);
		} finally {
			setIsSharingConversation(false);
		}
	}, [
		captureChatEvent,
		clearRuntimeError,
		copyToClipboard,
		currentMessage,
		sessionId,
		setRuntimeErrorMessage,
		visibleMessages,
	]);

	useEffect(() => {
		setLastSharedConversationUrl(null);
		setIsSharingConversation(false);
	}, []);

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

	// Scroll chat to bottom whenever the footer question overlay appears, changes, or disappears
	// biome-ignore lint/correctness/useExhaustiveDependencies: pendingQuestion is an intentional re-run trigger
	useEffect(() => {
		bumpFooterScroll();
	}, [bumpFooterScroll, pendingQuestion]);

	const shouldAnimate = useShouldAnimate("essential");

	// Scroll chat to bottom whenever the approval band appears or changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: pendingApproval?.toolCallId is an intentional re-run trigger
	useEffect(() => {
		bumpFooterScroll();
	}, [bumpFooterScroll, pendingApproval?.toolCallId]);

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

			let preparedFiles = payload.files;
			let effectiveSessionId = sessionId;

			if (preparedFiles?.some((file) => file.uploaded === false)) {
				if (!effectiveSessionId) {
					effectiveSessionId = await getOrCreateSession();
				}

				const uploadedFiles = await uploadFiles(
					effectiveSessionId,
					preparedFiles.map((file) => ({
						type: "file",
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
				},
			};

			let targetSessionId = effectiveSessionId;
			try {
				if (!targetSessionId) {
					targetSessionId = await getOrCreateSession();
				}

				if (sessionId && targetSessionId === sessionId) {
					await commands.sendMessage(sendInput);
				} else {
					// New-session path: the existing-session path's optimistic
					// state lives inside useChatDisplay, but we don't have a
					// session subscribed there yet. Hold the user message in
					// pendingUserTurn so getVisibleMessagesWithPendingUserTurn
					// keeps it visible across stale snapshot polls until the
					// harness's response includes it.
					const optimisticMessage = toOptimisticUserMessage(sendInput);
					if (optimisticMessage) {
						setPendingUserTurn({
							kind: "append",
							message: optimisticMessage,
						});
					}
					try {
						await sendMessageToSession(targetSessionId, sendInput);
					} catch (error) {
						setPendingUserTurn(null);
						throw error;
					}
				}
				if (content) {
					onUserMessageSubmitted?.(content);
				}
			} catch (error) {
				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (error instanceof Error) throw error;
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
		},
		[
			activeModel?.id,
			captureChatEvent,
			clearRuntimeError,
			commands,
			getOrCreateSession,
			messages?.length,
			resolveSlashCommandInput,
			sessionId,
			sendMessageToSession,
			setRuntimeErrorMessage,
			onUserMessageSubmitted,
			thinkingLevel,
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
				},
			};

			try {
				let targetSessionId = autoLaunchSessionLockRef.current[launchConfigKey];
				if (!targetSessionId) {
					targetSessionId = await getOrCreateSession();
					autoLaunchSessionLockRef.current[launchConfigKey] = targetSessionId;
				}
				if (sessionId && targetSessionId === sessionId) {
					await commands.sendMessage(sendInput);
				} else {
					await sendMessageToSession(targetSessionId, sendInput);
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
			} catch (error) {
				autoLaunchInFlightRef.current = null;

				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				logger.debug("[chat] auto launch send failed", error);

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
		getOrCreateSession,
		initialLaunchConfig,
		sendMessageToSession,
		sessionId,
		setRuntimeErrorMessage,
		onUserMessageSubmitted,
		thinkingLevel,
		onConsumeLaunchConfig,
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
			request: UserMessageRestartRequest,
			options?: { trigger?: "edit" | "resend" },
		) => {
			if (!sessionId) {
				throw new Error("Сессия чата ещё запускается. Повторите попытку.");
			}

			setInterruptedMessage(null);
			setPendingUserTurn(null);
			setSubmitStatus("submitted");
			clearRuntimeError();

			const optimisticMessage = toOptimisticUserMessage({
				payload: request.payload,
				metadata: {
					model: activeModel?.id,
					thinkingLevel,
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
				await restartFromMessageMutation.mutateAsync({
					sessionId,
					workspaceId,
					messageId: request.messageId,
					payload: request.payload,
					metadata: {
						model: activeModel?.id,
						thinkingLevel,
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
			} catch (error) {
				setPendingUserTurn(null);
				const sendErrorMessage = toSendFailureMessage(error);
				setSubmitStatus(undefined);
				setRuntimeErrorMessage(sendErrorMessage);
				if (error instanceof Error) throw error;
				throw new Error(sendErrorMessage);
			}
		},
		[
			activeModel?.id,
			captureChatEvent,
			clearRuntimeError,
			messages,
			onUserMessageSubmitted,
			restartFromMessageMutation,
			sessionId,
			setRuntimeErrorMessage,
			thinkingLevel,
			workspaceId,
		],
	);
	const handleResendUserMessage = useCallback(
		async (request: UserMessageRestartRequest) => {
			await restartFromUserMessage(request, { trigger: "resend" });
		},
		[restartFromUserMessage],
	);
	const handleSubmitEditedUserMessage = useCallback(
		async (request: UserMessageRestartRequest) => {
			await restartFromUserMessage(request, { trigger: "edit" });
		},
		[restartFromUserMessage],
	);
	const handleApprovalResponse = useCallback(
		async (decision: "approve" | "decline" | "always_allow_category") => {
			if (!pendingApproval?.toolCallId) return;
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
		[clearRuntimeError, commands, pendingApproval?.toolCallId],
	);
	const handlePlanResponse = useCallback(
		async (response: {
			action: "approved" | "rejected";
			feedback?: string;
		}) => {
			if (!pendingPlanApproval?.planId) return;
			clearRuntimeError();
			setPlanResponsePending(true);
			try {
				const feedback = response.feedback?.trim();
				await commands.respondToPlan({
					payload: {
						planId: pendingPlanApproval.planId,
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
		[clearRuntimeError, commands, pendingPlanApproval?.planId],
	);
	const handleQuestionResponse = useCallback(
		async (questionId: string, answer: string) => {
			const trimmedQuestionId = questionId.trim();
			const trimmedAnswer = answer.trim();
			if (!trimmedQuestionId || !trimmedAnswer) return;
			clearRuntimeError();
			bumpFooterScroll();
			setQuestionResponsePending(true);
			try {
				await commands.respondToQuestion({
					payload: {
						questionId: trimmedQuestionId,
						answer: trimmedAnswer,
					},
				});
			} finally {
				setQuestionResponsePending(false);
			}
		},
		[bumpFooterScroll, clearRuntimeError, commands],
	);

	const errorMessage = runtimeError ?? toErrorMessage(error);

	return (
		<PromptInputProvider initialInput={initialLaunchConfig?.draftInput}>
			<div className="relative flex h-full w-full flex-col bg-background">
				<ChatMessageList
					messages={visibleMessages}
					isFocused={isFocused}
					isRunning={canAbort}
					isConversationLoading={isConversationLoading}
					isAwaitingAssistant={isAwaitingAssistant}
					currentMessage={currentMessage ?? null}
					interruptedMessage={interruptedMessage}
					workspaceId={workspaceId}
					sessionId={sessionId}
					organizationId={organizationId}
					workspaceCwd={cwd}
					activeTools={activeTools}
					toolInputBuffers={toolInputBuffers}
					activeSubagents={activeSubagents}
					pendingApproval={pendingApproval}
					isApprovalSubmitting={approvalResponsePending}
					onApprovalRespond={handleApprovalResponse}
					pendingPlanApproval={pendingPlanApproval}
					isPlanSubmitting={planResponsePending}
					onPlanRespond={handlePlanResponse}
					editingUserMessageId={editingUserMessageId}
					isEditSubmitting={isAwaitingAssistant}
					onStartEditUserMessage={setEditingUserMessageId}
					onCancelEditUserMessage={() => setEditingUserMessageId(null)}
					onSubmitEditedUserMessage={handleSubmitEditedUserMessage}
					onRestartUserMessage={handleResendUserMessage}
					onShareConversation={handleShareConversation}
					isSharingConversation={isSharingConversation}
					lastSharedConversationUrl={lastSharedConversationUrl}
					footerScrollTrigger={footerScrollTrigger}
				/>
				<McpControls mcpUi={mcpUi} />
				<AnimatedPresence initial={false}>
					{pendingApproval ? (
						<motion.div
							key={pendingApproval.toolCallId}
							layout
							initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
							animate={{ opacity: 1, y: 0 }}
							exit={shouldAnimate ? { opacity: 0, y: 12 } : { opacity: 0 }}
							transition={shouldAnimate ? motionSpring.gentle : { duration: 0 }}
							className="mx-auto w-full max-w-[680px] px-4"
						>
							<PendingApprovalMessage
								approval={pendingApproval}
								isSubmitting={approvalResponsePending}
								onRespond={handleApprovalResponse}
							/>
						</motion.div>
					) : null}
				</AnimatedPresence>
				<ChatUploadFooter
					cwd={cwd}
					isFocused={isFocused}
					error={errorMessage}
					canAbort={canAbort}
					submitStatus={submitStatus}
					availableModels={availableModels}
					selectedModel={activeModel}
					setSelectedModel={handleSelectModel}
					modelSelectorOpen={modelSelectorOpen}
					setModelSelectorOpen={setModelSelectorOpen}
					permissionMode={permissionMode}
					setPermissionMode={setPermissionMode}
					thinkingLevel={thinkingLevel}
					setThinkingLevel={setThinkingLevel}
					slashCommands={slashCommands}
					sessionId={sessionId}
					workspaceId={workspaceId}
					onError={setRuntimeErrorMessage}
					onSend={handleSend}
					onSubmitStart={() => setSubmitStatus("submitted")}
					onStop={handleStop}
					pendingQuestion={pendingQuestion}
					isQuestionSubmitting={questionResponsePending}
					onQuestionRespond={handleQuestionResponse}
					onQuestionCancel={() => {
						bumpFooterScroll();
						void stopActiveResponse();
					}}
				/>
			</div>
		</PromptInputProvider>
	);
}
