/**
 * ChatTransport — the single seam between the chat render layer
 * (`WorkspaceChatInterface`) and the underlying delivery mechanism.
 *
 * Historically the desktop app carried TWO near-identical chat stacks that had
 * to be hand-synced: the v2 workspace pane talking to `workspaceTrpc.chat.*`
 * (host-service) and the legacy mosaic pane talking to the chat-runtime IPC
 * client (`chatRuntimeServiceTrpc.session.*`). The render layer, the optimistic
 * user-turn logic and the active-turn dedup were forked across both.
 *
 * `ChatTransport` lifts the backend choice behind one interface so the render
 * layer and the optimistic/turn-dedup logic live exactly once (see
 * `useChatDisplay`). Two adapters implement it — one per backend — and a future
 * web/mobile twin only needs a third adapter, not a third UI.
 *
 * The streaming subscription is modelled as a React hook (`useSnapshot`) rather
 * than a plain callback because both existing backends surface their live state
 * through React Query polling subscriptions; encapsulating the hook keeps the
 * subscription wiring (refetch interval, enablement, cache-key) owned by the
 * adapter while the consumer only sees a normalized snapshot.
 */

export interface ChatTransportFileInput {
	data: string;
	mediaType: string;
	filename?: string;
}

export interface ChatSendPayload {
	content: string;
	files?: ChatTransportFileInput[];
}

export interface ChatTurnMetadata {
	model?: string;
	thinkingLevel?: string;
	permissionMode?: string;
}

export interface ChatSendArgs {
	payload: ChatSendPayload;
	metadata?: ChatTurnMetadata;
}

export interface ChatRestartArgs extends ChatSendArgs {
	messageId: string;
}

export interface ChatApprovalArgs {
	payload: {
		decision: "approve" | "decline" | "always_allow_category";
	};
}

export interface ChatPlanArgs {
	payload: {
		planId: string;
		response: { action: "approved" | "rejected"; feedback?: string };
	};
}

export interface ChatQuestionArgs {
	payload: { questionId: string; answer: string };
}

/**
 * The minimal display-state shape both backends already expose. Adapters narrow
 * their richer router output to this; the render layer reads it structurally so
 * extra backend-specific fields (e.g. token budget, boot state) are forwarded
 * untouched via spread.
 */
export interface ChatDisplaySnapshot<
	TMessage = unknown,
	TDisplayState = Record<string, unknown>,
> {
	/** Backend display state spread verbatim into the consumer return (currentMessage, isRunning, activeTools, pendingApproval, …). */
	displayState: TDisplayState | null;
	/** Committed conversation history (server-of-record ordering). */
	historicalMessages: TMessage[];
	/** True while the first snapshot for an enabled session is still loading / booting. */
	isConversationLoading: boolean;
	/** Backend-derived error (boot failure, query error). `null` when healthy. */
	queryError: unknown;
}

export interface UseChatSnapshotOptions {
	sessionId: string | null;
	enabled: boolean;
	fps: number;
}

/**
 * A ChatTransport binds the render layer to one backend. It is created once per
 * pane (memoized on its identifying scope) and passed to `useChatDisplay`.
 */
export interface ChatTransport<
	TMessage = unknown,
	TDisplayState = Record<string, unknown>,
> {
	/** Stable identifier for the backend kind — useful for analytics/debug. */
	readonly kind: "workspace-trpc" | "chat-runtime";

	/**
	 * Live snapshot subscription. Implemented as a hook so adapters own their
	 * React Query polling wiring. MUST obey the rules-of-hooks (called
	 * unconditionally by `useChatDisplay`).
	 */
	useSnapshot(
		options: UseChatSnapshotOptions,
	): ChatDisplaySnapshot<TMessage, TDisplayState>;

	send(args: ChatSendArgs): Promise<unknown>;
	restart(args: ChatRestartArgs): Promise<unknown>;
	stop(): Promise<unknown>;
	respondToApproval(args: ChatApprovalArgs): Promise<unknown>;
	respondToPlan(args: ChatPlanArgs): Promise<unknown>;
	respondToQuestion(args: ChatQuestionArgs): Promise<unknown>;
	listMessages(): Promise<TMessage[]>;
	getSlashCommands(): Promise<unknown>;
	getMcpOverview(rootCwd: string): Promise<unknown>;
}
