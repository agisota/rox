import { chatRuntimeServiceTrpc, chatServiceTrpc } from "@rox/chat/client";
import {
	PromptInputAttachment,
	type PromptInputMessage,
	useProviderAttachments,
} from "@rox/ui/ai-elements/prompt-input";
import { toast } from "@rox/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	ChatFooterFrame,
	ChatMessageFrame,
	ChatSendMessageInput,
} from "renderer/components/Chat/ChatInterface/ChatPaneShell";
import { ChatPaneShell } from "renderer/components/Chat/ChatInterface/ChatPaneShell";
import { sendMessageForSession } from "renderer/components/Chat/ChatInterface/ChatPaneShell/utils/sendMessage";
import { ChatInputFooter } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter";
import {
	resolveActiveModel,
	unresolvedModelMessage,
} from "renderer/components/Chat/ChatInterface/components/ModelPicker/utils/activeModelResolution";
import { resolveSelectableModels } from "renderer/components/Chat/ChatInterface/components/ModelPicker/utils/selectableModels";
import { usePermissionModePreference } from "renderer/components/Chat/ChatInterface/hooks/usePermissionModePreference";
import { useSlashCommandExecutor } from "renderer/components/Chat/ChatInterface/hooks/useSlashCommandExecutor";
import {
	type ChatRuntimeMessage,
	useChatRuntimeChatTransport,
	useChatDisplay as useTransportChatDisplay,
} from "renderer/components/Chat/ChatInterface/transport";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	getDesktopChatModelOptions,
	isDesktopChatDevMode,
} from "renderer/lib/dev-chat";
import { posthog } from "renderer/lib/posthog";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatMessageList } from "./components/ChatMessageList";
import type { ChatPendingQuestion } from "./components/ChatMessageList/ChatMessageList.types";
import { DraftSaver } from "./components/DraftSaver";
import { McpControls } from "./components/McpControls";
import { useMcpUi } from "./hooks/useMcpUi";
import { useOptimisticUpload } from "./hooks/useOptimisticUpload";
import type { ChatPaneInterfaceProps } from "./types";

type HarnessFilePayload = {
	data: string;
	mediaType: string;
	filename?: string;
	uploaded?: boolean;
};

function ChatUploadFooter({
	sessionId,
	onError,
	onSend,
	...footerProps
}: {
	sessionId: string | null;
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

export function ChatPaneInterface({
	paneId,
	sessionId,
	initialLaunchConfig,
	workspaceId,
	organizationId,
	cwd,
	isFocused,
	isSessionReady,
	ensureSessionReady,
	onStartFreshSession,
	onConsumeLaunchConfig,
	onUserMessageSubmitted,
	recents,
	onSelectRecent,
}: ChatPaneInterfaceProps) {
	const { models: catalogModels, defaultModel } = useAvailableModels();
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	// Merge the user's custom OpenAI-compatible provider models into the catalog
	// (persisted + live `/v1/models` refresh on picker-open) so a selected custom
	// id resolves against the SAME superset the picker shows — closing the legacy
	// pane's silent-fallback path where `useAvailableModels()` only knew the
	// catalog and a custom selection quietly snapped back to the house model.
	const { data: customProviderConfig } =
		chatServiceTrpc.auth.getCustomProviderConfig.useQuery();
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
				// The list stays on the persisted entries, but the failure is no
				// longer swallowed: signal that `/v1/models` is unreachable.
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
	// Resolve the active model WITHOUT the historical silent swap: an unresolved
	// persisted custom selection now yields an explicit `unresolvedModelId`.
	const { activeModel, selectedModel, unresolvedModelId } = useMemo(
		() =>
			resolveActiveModel({
				selectedModelId,
				availableModels,
				defaultModel,
			}),
		[selectedModelId, availableModels, defaultModel],
	);
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
	// Persisted + shared with the v2 pane (one localStorage key). Defaults to the
	// safe "default" (manual-confirm) instead of the previous in-memory
	// "bypassPermissions" hardcode that reset every session — closing the
	// desktop-agent security gap. The selected mode is threaded into each turn's
	// metadata below so the runtime enforces it.
	const [permissionMode, setPermissionMode] = usePermissionModePreference();
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(
		null,
	);
	const isSendingRef = useRef(false);
	const previousSessionIdRef = useRef(sessionId);
	const chatRuntimeServiceTrpcUtils = chatRuntimeServiceTrpc.useUtils();
	const authenticateMcpServerMutation =
		chatRuntimeServiceTrpc.workspace.authenticateMcpServer.useMutation();
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

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery(
			{ cwd },
			{ enabled: Boolean(cwd) },
		);

	const chatTransport = useChatRuntimeChatTransport({ cwd, sessionId });
	const chat = useTransportChatDisplay(chatTransport, {
		sessionId,
		enabled: Boolean(sessionId),
		fps: 60,
	});
	const { commands } = chat;

	const isRunning = Boolean(
		(chat as unknown as { isRunning?: boolean }).isRunning,
	);
	const pendingQuestion =
		(chat as unknown as { pendingQuestion?: ChatPendingQuestion })
			.pendingQuestion ?? null;
	const canAbort = isRunning;

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

	const loadMcpOverview = useCallback(
		async (rootCwd: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return chatRuntimeServiceTrpcUtils.workspace.getMcpOverview.fetch({
				sessionId,
				cwd: rootCwd,
			});
		},
		[chatRuntimeServiceTrpcUtils.workspace.getMcpOverview, sessionId],
	);
	const authenticateMcpServer = useCallback(
		async (rootCwd: string, serverName: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return authenticateMcpServerMutation.mutateAsync({
				sessionId,
				cwd: rootCwd,
				serverName,
			});
		},
		[authenticateMcpServerMutation, sessionId],
	);
	const mcpUi = useMcpUi({
		cwd,
		loadOverview: loadMcpOverview,
		authenticateServer: authenticateMcpServer,
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
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession,
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
	// orchestration-body scope reset; here we only refresh the legacy-specific
	// MCP overview the wrapper renders.
	useEffect(() => {
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [refreshMcpOverview, resetMcpUi, sessionId]);

	const clearDraftInStore = useCallback(() => {
		const { panes, setChatLaunchConfig } = useTabsStore.getState();
		setChatLaunchConfig(paneId, {
			...(panes[paneId]?.chat?.launchConfig ?? null),
			draftInput: undefined,
		});
	}, [paneId]);

	useEffect(() => {
		if (sessionId === previousSessionIdRef.current) return;
		previousSessionIdRef.current = sessionId;
		clearDraftInStore();
	}, [clearDraftInStore, sessionId]);

	// Reset optimistic hide when a new question arrives
	useEffect(() => {
		if (pendingQuestion && pendingQuestion.questionId !== answeredQuestionId) {
			setAnsweredQuestionId(null);
		}
	}, [pendingQuestion, answeredQuestionId]);

	const session = useMemo(
		() => ({
			isSessionReady,
			// The legacy create→ensure session-readiness ladder, reduced to pure
			// resolution: create a fresh session when none exists, then (for the
			// current session that isn't ready yet) await `ensureSessionReady`.
			// The shell decides send-to-current vs send-to-other from the resolved
			// id, so resolution and delivery stay separated. Behavior is pinned by
			// the legacy `sendMessageForSession` characterization tests.
			resolveSessionForSend: async (currentSessionId: string | null) => {
				const { targetSessionId } = await sendMessageForSession({
					currentSessionId,
					isSessionReady,
					ensureSessionReady,
					onStartFreshSession,
					sendToCurrentSession: async () => undefined,
					sendToSession: async () => undefined,
				});
				return targetSessionId;
			},
			resetSession: async () => {
				await onStartFreshSession();
			},
		}),
		[ensureSessionReady, isSessionReady, onStartFreshSession],
	);

	const turn = useMemo(
		() => ({
			sendToSession: async (
				targetSessionId: string,
				input: ChatSendMessageInput,
			) => {
				// Plain delivery: the shell owns the optimistic `pendingUserTurn` for
				// the other-session path, so the wrapper does NOT also write to the
				// chat-runtime list cache (that double-optimism raced the polls).
				await chatRuntimeServiceTrpcUtils.client.session.sendMessage.mutate({
					sessionId: targetSessionId,
					...(cwd ? { cwd } : {}),
					...input,
				});
			},
			restartFromMessage: async (args: {
				sessionId: string;
				messageId: string;
				payload: ChatSendMessageInput["payload"];
				metadata: ChatSendMessageInput["metadata"];
			}) => {
				await chatRuntimeServiceTrpcUtils.client.session.restartFromMessage.mutate(
					{
						sessionId: args.sessionId,
						...(cwd ? { cwd } : {}),
						messageId: args.messageId,
						payload: args.payload,
						metadata: args.metadata,
					},
				);
			},
		}),
		[chatRuntimeServiceTrpcUtils, cwd],
	);

	const handleQuestionAnswered = useCallback(
		(questionId: string) => {
			setAnsweredQuestionId(questionId);
			// Clear the orange dot immediately when the user submits their answer.
			useTabsStore.getState().setPaneStatus(paneId, "idle");
		},
		[paneId],
	);
	const handleQuestionAnswerFailed = useCallback(
		(questionId: string) => {
			// Roll back optimistic UI if the respond RPC fails.
			setAnsweredQuestionId((current) =>
				current === questionId ? null : current,
			);
			useTabsStore.getState().setPaneStatus(paneId, "permission");
		},
		[paneId],
	);

	const draftSaver = useMemo(
		() => (
			<DraftSaver
				paneId={paneId}
				sessionId={sessionId}
				isSendingRef={isSendingRef}
			/>
		),
		[paneId, sessionId],
	);

	const features = useMemo(
		() => ({
			draftSaver,
			onAfterSend: clearDraftInStore,
			onQuestionAnswered: handleQuestionAnswered,
			onQuestionAnswerFailed: handleQuestionAnswerFailed,
		}),
		[
			clearDraftInStore,
			draftSaver,
			handleQuestionAnswered,
			handleQuestionAnswerFailed,
		],
	);

	const renderMessages = useCallback(
		(frame: ChatMessageFrame<ChatRuntimeMessage>) => (
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
				pendingApproval={
					frame.pendingApproval as React.ComponentProps<
						typeof ChatMessageList
					>["pendingApproval"]
				}
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
				pendingQuestion={pendingQuestion}
				answeredQuestionId={answeredQuestionId}
				recents={recents}
				onSelectRecent={onSelectRecent}
			/>
		),
		[answeredQuestionId, onSelectRecent, pendingQuestion, recents],
	);

	const renderFooter = useCallback(
		(frame: ChatFooterFrame) => {
			const framePendingQuestion = frame.pendingQuestion as ChatPendingQuestion;
			const onSendWithDraftGuard = async (payload: {
				content: string;
				files?: HarnessFilePayload[];
			}) => {
				// Flag the in-flight send so `DraftSaver` skips persisting the empty
				// textarea that PromptInput clears on submit (otherwise the just-sent
				// draft would be re-saved as blank). Mirrors the pre-cutover
				// `isSendingRef.current = true` set inside the old inline handleSend.
				isSendingRef.current = true;
				try {
					await frame.onSend(payload);
				} catch (error) {
					isSendingRef.current = false;
					throw error;
				}
			};
			return (
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
					onError={frame.onError}
					onSend={onSendWithDraftGuard}
					onSubmitStart={frame.onSubmitStart}
					onStop={frame.onStop}
					pendingQuestion={
						framePendingQuestion?.questionId === answeredQuestionId
							? null
							: framePendingQuestion
					}
					isQuestionSubmitting={frame.isQuestionSubmitting}
					onQuestionRespond={frame.onQuestionRespond}
					onQuestionCancel={frame.onQuestionCancel}
				/>
			);
		},
		[answeredQuestionId, runtimeError],
	);

	const renderMcpControls = useCallback(
		() => <McpControls mcpUi={mcpUi} />,
		[mcpUi],
	);

	return (
		<ChatPaneShell<ChatRuntimeMessage>
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
