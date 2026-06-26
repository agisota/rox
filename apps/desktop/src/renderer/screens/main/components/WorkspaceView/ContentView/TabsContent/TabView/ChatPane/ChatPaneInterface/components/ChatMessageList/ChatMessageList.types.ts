import type { UseChatDisplayReturn } from "@rox/chat/client";
import type { ScrollbackRecent } from "@rox/ui/ai-elements/message-scrollback-rail";

export type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

export type ChatActiveTools = NonNullable<UseChatDisplayReturn["activeTools"]>;

export type ChatToolInputBuffers = NonNullable<
	UseChatDisplayReturn["toolInputBuffers"]
>;

export type ChatActiveSubagents = NonNullable<
	UseChatDisplayReturn["activeSubagents"]
>;

export type ChatActiveSubagent =
	ChatActiveSubagents extends Map<string, infer SubagentState>
		? SubagentState
		: never;

export type ChatActiveTool =
	ChatActiveTools extends Map<string, infer ToolState> ? ToolState : never;

export type ChatToolInputBuffer =
	ChatToolInputBuffers extends Map<string, infer InputBuffer>
		? InputBuffer
		: never;

export type ChatPendingApproval = UseChatDisplayReturn["pendingApproval"];

export type ChatPendingPlanApproval =
	UseChatDisplayReturn["pendingPlanApproval"];

export type ChatPendingQuestion = UseChatDisplayReturn["pendingQuestion"];

export interface InterruptedMessagePreview {
	id: string;
	sourceMessageId: string;
	content: ChatMessage["content"];
}

export interface UserMessageActionPayload {
	content: string;
	files?: Array<{
		data: string;
		mediaType: string;
		filename?: string;
		uploaded: false;
	}>;
}

export interface UserMessageRestartRequest {
	messageId: string;
	prefixMessages: ChatMessage[];
	payload: UserMessageActionPayload;
}

export interface ChatMessageListProps {
	messages: ChatMessage[];
	isFocused: boolean;
	isRunning: boolean;
	isConversationLoading: boolean;
	isAwaitingAssistant: boolean;
	currentMessage: ChatMessage | null;
	interruptedMessage: InterruptedMessagePreview | null;
	workspaceId: string;
	sessionId: string | null;
	organizationId: string | null;
	workspaceCwd?: string;
	activeTools: ChatActiveTools | undefined;
	toolInputBuffers: ChatToolInputBuffers | undefined;
	activeSubagents: ChatActiveSubagents | undefined;
	pendingApproval: ChatPendingApproval;
	isApprovalSubmitting: boolean;
	onApprovalRespond: (
		decision: "approve" | "decline" | "always_allow_category",
	) => Promise<void>;
	pendingPlanApproval: ChatPendingPlanApproval;
	isPlanSubmitting: boolean;
	onPlanRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
	pendingQuestion: ChatPendingQuestion;
	answeredQuestionId: string | null;
	editingUserMessageId: string | null;
	isEditSubmitting: boolean;
	onStartEditUserMessage: (messageId: string) => void;
	onCancelEditUserMessage: () => void;
	onSubmitEditedUserMessage: (
		request: UserMessageRestartRequest,
	) => Promise<void>;
	onRestartUserMessage: (request: UserMessageRestartRequest) => Promise<void>;
	/** Cross-session recents (~10) for the scrollback rail's Recents-flyout (F49). */
	recents?: ScrollbackRecent[];
	/** Jump to a recent session from the rail's Recents-flyout (F49). */
	onSelectRecent?: (sessionId: string) => void;
}
