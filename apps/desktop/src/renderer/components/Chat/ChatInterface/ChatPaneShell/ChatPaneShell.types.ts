/**
 * Contracts for the unified, generic, presentational `ChatPaneShell`.
 *
 * The shell holds the ~80% orchestration body shared by the two ChatPane render
 * shells (v2 workspace pane + legacy mosaic pane). It is generic over the
 * backend message type (`TMessage extends DisplayMessage`) and the backend
 * display-state shape (`TDisplayState`), receives the ALREADY-BUILT
 * `ChatDisplayResult` (each wrapper runs `useChatDisplay` with its own
 * transport), and renders its forked child trees (`ChatMessageList`,
 * `ChatInputFooter`, `McpControls`, the optional standalone approval overlay)
 * via render-props so the two forked subtrees stay forked.
 *
 * The two places the wrappers genuinely diverge are routed through adapters
 * (`SessionLifecycleAdapter`, `TurnAdapter`) and optional `features`.
 */

import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import type { ChatStatus } from "ai";
import type { ReactNode, SetStateAction } from "react";
import type { DisplayMessage } from "renderer/components/Chat/ChatInterface/transport/messageDisplayHelpers";
import type { ChatDisplayResult } from "renderer/components/Chat/ChatInterface/transport/useChatDisplay";
import type {
	ModelOption,
	PermissionMode,
} from "renderer/components/Chat/ChatInterface/types";
import type { ChatLaunchConfig } from "shared/tabs-types";

/**
 * The shared turn shape both wrappers feed in (identical to both trees'
 * `sendMessage` util `ChatSendMessageInput`).
 */
export type ChatSendMessageInput = {
	payload: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	};
	metadata: {
		model?: string;
		thinkingLevel?: ThinkingLevel;
		permissionMode?: PermissionMode;
	};
};

/**
 * Restart/edit/resend request the wrapper's ChatMessageList hands back. Generic
 * over the concrete message so the shell can hold the prefix messages for the
 * optimistic restart turn while staying backend-agnostic.
 */
export interface UserMessageRestartRequest<TMessage extends DisplayMessage> {
	messageId: string;
	prefixMessages: TMessage[];
	payload: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
			uploaded: false;
		}>;
	};
}

/**
 * Subsumes both session contracts.
 * - v2: `isSessionReady` is always true; `resolveSessionForSend` is
 *   `cur ?? getOrCreateSession()`.
 * - legacy: `resolveSessionForSend` drives the `sendMessageForSession`
 *   create→ensure ladder.
 */
export interface SessionLifecycleAdapter {
	isSessionReady: boolean;
	resolveSessionForSend: (currentSessionId: string | null) => Promise<string>;
	resetSession: () => Promise<void>;
}

/**
 * Subsumes the workspace-mutation (v2) vs chat-runtime cache-optimism (legacy)
 * send/restart paths. The shell owns the `pendingUserTurn` optimism; the
 * adapter only performs the backend write for the new/other-session path.
 */
export interface TurnAdapter {
	sendToSession: (
		targetSessionId: string,
		input: ChatSendMessageInput,
	) => Promise<void>;
	restartFromMessage: (args: {
		sessionId: string;
		messageId: string;
		payload: ChatSendMessageInput["payload"];
		metadata: ChatSendMessageInput["metadata"];
	}) => Promise<void>;
}

export interface ChatPaneShellFeatures {
	/** legacy `<DraftSaver .../>` element, rendered inside PromptInputProvider. */
	draftSaver?: ReactNode;
	/**
	 * v2 framer-motion approval band. Supplied as a render-prop so the v2
	 * wrapper can use ITS forked `PendingApprovalMessage` + motion stack; legacy
	 * omits it. The submit state + respond handler are passed explicitly (same
	 * values the shell threads into the message frame) so the overlay never has
	 * to reach into sibling render state.
	 */
	renderApprovalOverlay?: (
		pendingApproval: unknown,
		controls: {
			isSubmitting: boolean;
			onRespond: (
				decision: "approve" | "decline" | "always_allow_category",
			) => Promise<void>;
		},
	) => ReactNode;
	/** legacy `clearDraftInStore()`; v2 omits. Called after a successful send. */
	onAfterSend?: () => void;
	/**
	 * legacy paneStatus + answeredQuestionId optimism around
	 * `respondToQuestion`. Called immediately when the user submits an answer.
	 */
	onQuestionAnswered?: (questionId: string) => void;
	/** legacy rollback of the optimism above when the respond RPC fails. */
	onQuestionAnswerFailed?: (questionId: string) => void;
	/** v2 only; legacy omits. Passed through to the footer frame. */
	footerScrollTrigger?: number;
	/**
	 * v2 `bumpFooterScroll`; the shell calls this on pendingQuestion /
	 * pendingApproval changes so v2 can scroll its footer overlay into view.
	 */
	onBumpFooterScroll?: () => void;
}

/**
 * The ~25 shared props the shell computes for the (forked) ChatMessageList. The
 * narrowly-typed backend collections (activeTools, toolInputBuffers,
 * activeSubagents, pendingApproval, pendingPlanApproval) are typed `unknown`
 * here; the wrapper re-narrows them via its own ChatMessageList prop types.
 */
export interface ChatMessageFrame<TMessage extends DisplayMessage> {
	messages: TMessage[];
	currentMessage: TMessage | null;
	interruptedMessage: {
		id: string;
		sourceMessageId: string;
		content: TMessage["content"];
	} | null;
	isFocused: boolean;
	isRunning: boolean;
	isConversationLoading: boolean;
	isAwaitingAssistant: boolean;
	workspaceId: string;
	sessionId: string | null;
	organizationId: string | null;
	workspaceCwd: string;
	activeTools: unknown;
	toolInputBuffers: unknown;
	activeSubagents: unknown;
	pendingApproval: unknown;
	isApprovalSubmitting: boolean;
	onApprovalRespond: (
		decision: "approve" | "decline" | "always_allow_category",
	) => Promise<void>;
	pendingPlanApproval: unknown;
	isPlanSubmitting: boolean;
	onPlanRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
	editingUserMessageId: string | null;
	isEditSubmitting: boolean;
	onStartEditUserMessage: (messageId: string) => void;
	onCancelEditUserMessage: () => void;
	onSubmitEditedUserMessage: (
		request: UserMessageRestartRequest<TMessage>,
	) => Promise<void>;
	onRestartUserMessage: (
		request: UserMessageRestartRequest<TMessage>,
	) => Promise<void>;
}

/**
 * Footer props the shell computes for the (forked) ChatInputFooter /
 * ChatUploadFooter. The wrapper spreads these onto its footer and adds any
 * surface-specific extras (e.g. `workspaceId` for v2).
 */
export interface ChatFooterFrame {
	error: string | null;
	canAbort: boolean;
	submitStatus: ChatStatus | undefined;
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: (model: SetStateAction<ModelOption | null>) => void;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: (open: boolean) => void;
	unresolvedModelId: string | null;
	permissionMode: PermissionMode;
	setPermissionMode: (mode: PermissionMode) => void;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	slashCommands: unknown[];
	usedTokens: number;
	maxTokens: number;
	sessionId: string | null;
	cwd: string;
	isFocused: boolean;
	onError: (message: string) => void;
	onSend: (payload: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
			uploaded?: boolean;
		}>;
	}) => void | Promise<void>;
	onSubmitStart: () => void;
	onStop: (event: React.MouseEvent) => void | Promise<void>;
	footerScrollTrigger?: number;
	pendingQuestion: unknown;
	isQuestionSubmitting: boolean;
	onQuestionRespond: (questionId: string, answer: string) => Promise<void>;
	onQuestionCancel: () => void;
}

export interface ChatPaneShellProps<
	TMessage extends DisplayMessage,
	TDisplayState = Record<string, unknown>,
> {
	// already-built display result
	chat: ChatDisplayResult<TMessage, TDisplayState>;
	// identity/context
	sessionId: string | null;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	initialLaunchConfig: ChatLaunchConfig | null;
	onConsumeLaunchConfig?: () => void;
	onUserMessageSubmitted?: (message: string) => void;
	/**
	 * Cleared at the start of every send / restart / auto-launch attempt. Lets a
	 * wrapper that keeps its OWN error channel (MCP overview, slash-command, v2
	 * share failures) drop a stale message the moment the user sends again —
	 * preserving the pre-split single-`runtimeError` behavior where `handleSend`
	 * began with `clearRuntimeError()`.
	 */
	onClearExternalError?: () => void;
	// model selection (resolved by the wrapper)
	availableModels: ModelOption[];
	activeModel: ModelOption | null;
	selectedModel: ModelOption | null;
	unresolvedModelId: string | null;
	onSelectModel: (model: SetStateAction<ModelOption | null>) => void;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: (open: boolean) => void;
	// preferences (shared)
	permissionMode: PermissionMode;
	setPermissionMode: (mode: PermissionMode) => void;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	// slash commands (already resolved by wrapper)
	slashCommands: unknown[];
	resolveSlashCommandInput: (
		content: string,
	) => Promise<{ handled: boolean; nextText: string }>;
	// adapters
	session: SessionLifecycleAdapter;
	turn: TurnAdapter;
	// feature flags/slots
	features?: ChatPaneShellFeatures;
	// render-props (the crux)
	renderMessages: (frame: ChatMessageFrame<TMessage>) => ReactNode;
	renderFooter: (frame: ChatFooterFrame) => ReactNode;
	renderMcpControls: () => ReactNode;
}
