import { chatServiceTrpc } from "@rox/chat/client";
import type { AppRouter } from "@rox/host-service";
import {
	PromptInputAttachment,
	type PromptInputMessage,
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
import { motion } from "framer-motion";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	ChatFooterFrame,
	ChatMessageFrame,
	ChatSendMessageInput,
} from "renderer/components/Chat/ChatInterface/ChatPaneShell";
import { ChatPaneShell } from "renderer/components/Chat/ChatInterface/ChatPaneShell";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	getDesktopChatModelOptions,
	isDesktopChatDevMode,
} from "renderer/lib/dev-chat";
import { posthog } from "renderer/lib/posthog";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
import { usePermissionModePreference } from "../../hooks/usePermissionModePreference";
import {
	type UseChatDisplayReturn,
	useChatDisplay,
} from "../../hooks/useWorkspaceChatDisplay";
import { ChatInputFooter } from "./components/ChatInputFooter";
import { ChatMessageList } from "./components/ChatMessageList";
import type { ChatPendingApproval } from "./components/ChatMessageList/ChatMessageList.types";
import { PendingApprovalMessage } from "./components/ChatMessageList/components/PendingApprovalMessage/PendingApprovalMessage";
import { McpControls } from "./components/McpControls";
import {
	resolveActiveModel,
	unresolvedModelMessage,
} from "./components/ModelPicker/utils/activeModelResolution";
import { resolveSelectableModels } from "./components/ModelPicker/utils/selectableModels";
import { useMcpUi } from "./hooks/useMcpUi";
import { useOptimisticUpload } from "./hooks/useOptimisticUpload";
import { useSlashCommandExecutor } from "./hooks/useSlashCommandExecutor";
import type { ChatPaneInterfaceProps } from "./types";

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

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

type ChatShareMessage = {
	id: string;
	role: string;
	content: unknown[];
	createdAt?: string;
};

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
				if (cancelled) return;
				// Discovery is best-effort for the *list* (we keep the persisted
				// entries), but the failure is no longer swallowed silently: signal
				// it so the user knows their custom provider's `/v1/models` is
				// unreachable and a freshly-added model may be missing.
				setLiveCustomModelIds([]);
				toast.error(
					"Не удалось получить модели custom-провайдера — проверьте, что /v1/models доступен",
				);
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
	// Resolve the active model WITHOUT the historical silent fallback: when a
	// persisted custom-provider id can't be found (discovery failed / provider
	// reconfigured) we get an explicit `unresolvedModelId` instead of quietly
	// pretending the house model was the user's choice.
	const { activeModel, selectedModel, unresolvedModelId } = useMemo(
		() =>
			resolveActiveModel({
				selectedModelId,
				availableModels,
				defaultModel,
			}),
		[selectedModelId, availableModels, defaultModel],
	);
	// Surface the unresolved selection once per distinct id so the user isn't
	// silently downgraded to ROX R1 while believing they're on their custom model.
	const signaledUnresolvedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!unresolvedModelId) {
			signaledUnresolvedRef.current = null;
			return;
		}
		if (signaledUnresolvedRef.current === unresolvedModelId) return;
		signaledUnresolvedRef.current = unresolvedModelId;
		toast.error(unresolvedModelMessage(unresolvedModelId));
	}, [unresolvedModelId]);
	const thinkingLevel = useChatPreferencesStore((state) => state.thinkingLevel);
	const setThinkingLevel = useChatPreferencesStore(
		(state) => state.setThinkingLevel,
	);
	// Permission mode is persisted (and defaults to the safer "default" /
	// manual-confirm) instead of being hardwired to "bypassPermissions" — closing
	// the desktop-agent security gap noted in the surfaces spec (it previously
	// reset every session). The selected mode is now also threaded into each
	// turn's metadata below so the host-service runtime applies it to the harness
	// (default → every tool asks; acceptEdits → edits auto-apply; bypass → yolo).
	const [permissionMode, setPermissionMode] = usePermissionModePreference();
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [footerScrollTrigger, setFooterScrollTrigger] = useState(0);
	const bumpFooterScroll = useCallback(
		() => setFooterScrollTrigger((n) => n + 1),
		[],
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

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const captureChatEvent = useCallback(
		(event: string, properties?: Record<string, unknown>) => {
			posthog.capture(event, {
				workspace_id: workspaceId,
				session_id: sessionId,
				organization_id: organizationId,
				...properties,
			});
		},
		[organizationId, sessionId, workspaceId],
	);

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
	const { commands, messages, currentMessage } = chat;
	const visibleMessages = messages;

	const isRunning = Boolean(
		(chat as unknown as { isRunning?: boolean }).isRunning,
	);
	const canAbort = isRunning;

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

	const stopActiveResponse = useCallback(async () => {
		clearRuntimeError();
		await commands.stop();
	}, [clearRuntimeError, commands]);

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

	// MCP overview refresh on session/cwd scope change. The shell owns the
	// orchestration-body scope reset; here we only refresh the v2-specific MCP
	// overview the wrapper renders.
	useEffect(() => {
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [refreshMcpOverview, resetMcpUi, sessionId]);

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

	const shouldAnimate = useShouldAnimate("essential");

	const session = useMemo(
		() => ({
			isSessionReady: true,
			resolveSessionForSend: async (currentSessionId: string | null) =>
				currentSessionId ?? (await getOrCreateSession()),
			resetSession: onResetSession,
		}),
		[getOrCreateSession, onResetSession],
	);

	const turn = useMemo(
		() => ({
			sendToSession: async (
				targetSessionId: string,
				input: ChatSendMessageInput,
			) => {
				// Optimistic state for this path lives in the shell's
				// `pendingUserTurn`, NOT in the snapshot cache. Writing to the cache
				// here was racing with the snapshot polls — a poll could resolve
				// mid-mutation with the harness's pre-message state and clobber the
				// optimistic write, making the user message vanish briefly.
				await sendMessageMutation.mutateAsync({
					sessionId: targetSessionId,
					workspaceId,
					...input,
				});
			},
			restartFromMessage: async (args: {
				sessionId: string;
				messageId: string;
				payload: ChatSendMessageInput["payload"];
				metadata: ChatSendMessageInput["metadata"];
			}) => {
				await restartFromMessageMutation.mutateAsync({
					sessionId: args.sessionId,
					workspaceId,
					messageId: args.messageId,
					payload: args.payload,
					metadata: args.metadata,
				});
			},
		}),
		[restartFromMessageMutation, sendMessageMutation, workspaceId],
	);

	// The standalone v2 approval band reuses the SAME submit state + respond
	// handler the shell threads into the message frame; the shell passes them in
	// explicitly so the overlay never has to reach into sibling render state.
	const renderApprovalOverlay = useCallback(
		(
			pendingApproval: unknown,
			controls: {
				isSubmitting: boolean;
				onRespond: (
					decision: "approve" | "decline" | "always_allow_category",
				) => Promise<void>;
			},
		) => {
			const approval = pendingApproval as ChatPendingApproval;
			return (
				<AnimatedPresence initial={false}>
					{approval ? (
						<motion.div
							key={approval.toolCallId}
							layout
							initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
							animate={{ opacity: 1, y: 0 }}
							exit={shouldAnimate ? { opacity: 0, y: 12 } : { opacity: 0 }}
							transition={shouldAnimate ? motionSpring.gentle : { duration: 0 }}
							className="mx-auto w-full max-w-[680px] px-4"
						>
							<PendingApprovalMessage
								approval={approval}
								isSubmitting={controls.isSubmitting}
								onRespond={controls.onRespond}
							/>
						</motion.div>
					) : null}
				</AnimatedPresence>
			);
		},
		[shouldAnimate],
	);

	const features = useMemo(
		() => ({
			footerScrollTrigger,
			onBumpFooterScroll: bumpFooterScroll,
			renderApprovalOverlay,
		}),
		[bumpFooterScroll, footerScrollTrigger, renderApprovalOverlay],
	);

	const renderMessages = useCallback(
		(frame: ChatMessageFrame<ChatMessage>) => {
			return (
				<ChatMessageList
					messages={frame.messages}
					isFocused={frame.isFocused}
					isRunning={frame.isRunning}
					isConversationLoading={frame.isConversationLoading}
					isAwaitingAssistant={frame.isAwaitingAssistant}
					currentMessage={frame.currentMessage}
					interruptedMessage={frame.interruptedMessage}
					workspaceId={frame.workspaceId}
					sessionId={frame.sessionId}
					organizationId={frame.organizationId}
					workspaceCwd={frame.workspaceCwd}
					activeTools={
						frame.activeTools as React.ComponentProps<
							typeof ChatMessageList
						>["activeTools"]
					}
					toolInputBuffers={
						frame.toolInputBuffers as React.ComponentProps<
							typeof ChatMessageList
						>["toolInputBuffers"]
					}
					activeSubagents={
						frame.activeSubagents as React.ComponentProps<
							typeof ChatMessageList
						>["activeSubagents"]
					}
					pendingApproval={frame.pendingApproval as ChatPendingApproval}
					isApprovalSubmitting={frame.isApprovalSubmitting}
					onApprovalRespond={frame.onApprovalRespond}
					pendingPlanApproval={
						frame.pendingPlanApproval as React.ComponentProps<
							typeof ChatMessageList
						>["pendingPlanApproval"]
					}
					isPlanSubmitting={frame.isPlanSubmitting}
					onPlanRespond={frame.onPlanRespond}
					editingUserMessageId={frame.editingUserMessageId}
					isEditSubmitting={frame.isEditSubmitting}
					onStartEditUserMessage={frame.onStartEditUserMessage}
					onCancelEditUserMessage={frame.onCancelEditUserMessage}
					onSubmitEditedUserMessage={frame.onSubmitEditedUserMessage}
					onRestartUserMessage={frame.onRestartUserMessage}
					onShareConversation={handleShareConversation}
					isSharingConversation={isSharingConversation}
					lastSharedConversationUrl={lastSharedConversationUrl}
					footerScrollTrigger={footerScrollTrigger}
				/>
			);
		},
		[
			footerScrollTrigger,
			handleShareConversation,
			isSharingConversation,
			lastSharedConversationUrl,
		],
	);

	const renderFooter = useCallback(
		(frame: ChatFooterFrame) => (
			<ChatUploadFooter
				cwd={frame.cwd}
				isFocused={frame.isFocused}
				error={runtimeError ?? frame.error}
				canAbort={frame.canAbort}
				submitStatus={frame.submitStatus}
				availableModels={frame.availableModels}
				selectedModel={frame.selectedModel}
				setSelectedModel={frame.setSelectedModel}
				modelSelectorOpen={frame.modelSelectorOpen}
				setModelSelectorOpen={setModelSelectorOpen}
				unresolvedModelId={frame.unresolvedModelId}
				permissionMode={frame.permissionMode}
				setPermissionMode={frame.setPermissionMode}
				thinkingLevel={frame.thinkingLevel}
				setThinkingLevel={frame.setThinkingLevel}
				slashCommands={
					frame.slashCommands as React.ComponentProps<
						typeof ChatUploadFooter
					>["slashCommands"]
				}
				usedTokens={frame.usedTokens}
				maxTokens={frame.maxTokens}
				sessionId={frame.sessionId}
				workspaceId={workspaceId}
				onError={frame.onError}
				onSend={frame.onSend}
				onSubmitStart={frame.onSubmitStart}
				onStop={frame.onStop}
				pendingQuestion={
					frame.pendingQuestion as React.ComponentProps<
						typeof ChatUploadFooter
					>["pendingQuestion"]
				}
				isQuestionSubmitting={frame.isQuestionSubmitting}
				onQuestionRespond={frame.onQuestionRespond}
				onQuestionCancel={frame.onQuestionCancel}
			/>
		),
		[runtimeError, workspaceId],
	);

	const renderMcpControls = useCallback(
		() => <McpControls mcpUi={mcpUi} />,
		[mcpUi],
	);

	return (
		<ChatPaneShell<ChatMessage>
			chat={chat}
			sessionId={sessionId}
			workspaceId={workspaceId}
			organizationId={organizationId}
			cwd={cwd}
			isFocused={isFocused}
			initialLaunchConfig={initialLaunchConfig}
			onConsumeLaunchConfig={onConsumeLaunchConfig}
			onUserMessageSubmitted={onUserMessageSubmitted}
			onClearExternalError={clearRuntimeError}
			availableModels={availableModels}
			activeModel={activeModel}
			selectedModel={selectedModel}
			unresolvedModelId={unresolvedModelId}
			onSelectModel={handleSelectModel}
			modelSelectorOpen={modelSelectorOpen}
			setModelSelectorOpen={setModelSelectorOpen}
			permissionMode={permissionMode}
			setPermissionMode={setPermissionMode}
			thinkingLevel={thinkingLevel}
			setThinkingLevel={setThinkingLevel}
			slashCommands={slashCommands}
			resolveSlashCommandInput={resolveSlashCommandInput}
			session={session}
			turn={turn}
			features={features}
			renderMessages={renderMessages}
			renderFooter={renderFooter}
			renderMcpControls={renderMcpControls}
		/>
	);
}
