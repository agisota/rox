import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationLoadingState,
	ConversationScrollButton,
	useConversationContext,
} from "@rox/ui/ai-elements/conversation";
import { Button } from "@rox/ui/button";
import { AnimatePresence } from "framer-motion";
import { CheckIcon, Loader2Icon, Share2Icon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { MessageRow } from "renderer/motion";
import type {
	ChatMessage,
	ChatMessageListProps,
} from "./ChatMessageList.types";
import { AssistantMessage } from "./components/AssistantMessage";
import { ChatSearch } from "./components/ChatSearch";
import { InterruptedFooter } from "./components/InterruptedFooter";
import { MessageScrollbackRail } from "./components/MessageScrollbackRail";
import { PendingApprovalMessage } from "./components/PendingApprovalMessage";
import { PendingPlanApprovalMessage } from "./components/PendingPlanApprovalMessage";
import { ThinkingMessage } from "./components/ThinkingMessage";
import { ToolPreviewMessage } from "./components/ToolPreviewMessage";
import { UserMessage } from "./components/UserMessage";
import { useChatMessageSearch } from "./hooks/useChatMessageSearch";
import {
	findLatestSubmitPlanToolCallId,
	getInterruptedPreview,
	getStreamingPreviewToolParts,
	getVisibleMessages,
	removeInterruptedSourceMessage,
	resolvePendingPlanToolCallId,
} from "./utils/messageListHelpers";

function ScrollAnchor({ trigger }: { trigger: number }) {
	const { scrollToBottom, isAtBottom } = useConversationContext();
	const isAtBottomRef = useRef(isAtBottom);
	isAtBottomRef.current = isAtBottom;

	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger is an intentional re-run signal
	useEffect(() => {
		if (isAtBottomRef.current) {
			scrollToBottom("instant");
		}
	}, [trigger, scrollToBottom]);

	return null;
}

function ShareConversationIcon({
	isSharing,
	hasSharedUrl,
}: {
	isSharing: boolean;
	hasSharedUrl: boolean;
}) {
	if (isSharing) {
		return <Loader2Icon className="size-3.5 animate-spin" />;
	}
	if (hasSharedUrl) {
		return <CheckIcon className="size-3.5" />;
	}
	return <Share2Icon className="size-3.5" />;
}

export function ChatMessageList({
	messages,
	isFocused,
	isRunning,
	isConversationLoading,
	isAwaitingAssistant,
	currentMessage,
	interruptedMessage,
	workspaceId,
	sessionId,
	organizationId,
	workspaceCwd,
	activeTools,
	toolInputBuffers,
	pendingApproval,
	isApprovalSubmitting,
	onApprovalRespond,
	pendingPlanApproval,
	isPlanSubmitting,
	onPlanRespond,
	editingUserMessageId,
	isEditSubmitting,
	onStartEditUserMessage,
	onCancelEditUserMessage,
	onSubmitEditedUserMessage,
	onRestartUserMessage,
	onShareConversation,
	isSharingConversation = false,
	lastSharedConversationUrl = null,
	footerScrollTrigger = 0,
}: ChatMessageListProps) {
	const messageListRef = useRef<HTMLDivElement>(null);
	const chatSearch = useChatMessageSearch({
		containerRef: messageListRef,
		isFocused,
	});

	const visibleMessages = useMemo(
		() =>
			getVisibleMessages({
				messages,
				isRunning,
				currentMessage,
			}),
		[currentMessage, isRunning, messages],
	);

	const interruptedPreview = useMemo(
		() =>
			getInterruptedPreview({
				isRunning,
				interruptedMessage,
			}),
		[interruptedMessage, isRunning],
	);

	const renderedMessages = useMemo(
		() =>
			removeInterruptedSourceMessage({
				messages: visibleMessages,
				interruptedMessage: interruptedPreview ? interruptedMessage : null,
			}),
		[interruptedMessage, interruptedPreview, visibleMessages],
	);

	const previewToolParts = useMemo(
		() =>
			getStreamingPreviewToolParts({
				activeTools,
				toolInputBuffers,
			}),
		[activeTools, toolInputBuffers],
	);
	const pendingPlanToolCallId = useMemo(() => {
		const anchorMessages: ChatMessage[] = [...renderedMessages];
		if (interruptedPreview) {
			anchorMessages.push(interruptedPreview);
		}
		if (currentMessage?.role === "assistant") {
			anchorMessages.push(currentMessage);
		}

		const latestSubmitPlanToolCallId = findLatestSubmitPlanToolCallId({
			messages: anchorMessages,
			previewToolParts,
		});

		return resolvePendingPlanToolCallId({
			pendingPlanApproval,
			fallbackToolCallId: latestSubmitPlanToolCallId,
		});
	}, [
		currentMessage,
		interruptedPreview,
		pendingPlanApproval,
		previewToolParts,
		renderedMessages,
	]);

	const shouldShowStandalonePendingPlan = Boolean(
		pendingPlanApproval && !pendingPlanToolCallId,
	);

	const canShowPendingAssistantUi =
		isAwaitingAssistant && !currentMessage && !pendingApproval;
	const shouldShowThinking =
		canShowPendingAssistantUi &&
		!pendingPlanApproval &&
		previewToolParts.length === 0;
	const shouldShowToolPreview =
		canShowPendingAssistantUi &&
		previewToolParts.length > 0 &&
		(!pendingPlanApproval || Boolean(pendingPlanToolCallId));

	const hasConversationContent =
		renderedMessages.length > 0 || Boolean(interruptedPreview);
	const shouldShowConversationLoading =
		isConversationLoading && !isAwaitingAssistant && !hasConversationContent;
	const shouldShowEmptyState =
		!shouldShowConversationLoading && !hasConversationContent;
	const shouldShowShareButton = Boolean(
		onShareConversation && hasConversationContent,
	);
	let shareButtonLabel = "Share";
	if (isSharingConversation) {
		shareButtonLabel = "Publishing";
	} else if (lastSharedConversationUrl) {
		shareButtonLabel = "Link copied";
	}

	const inlineToolStateProps = {
		pendingPlanApproval,
		pendingPlanToolCallId,
		isPlanSubmitting,
		onPlanRespond,
	} as const;

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-[680px] py-6">
				<div ref={messageListRef} className="flex flex-col gap-6">
					{shouldShowShareButton ? (
						<div className="-mb-2 flex justify-end">
							<Button
								type="button"
								variant="secondary"
								size="xs"
								className="min-w-28"
								disabled={isSharingConversation}
								onClick={() => {
									void onShareConversation?.();
								}}
							>
								<ShareConversationIcon
									isSharing={isSharingConversation}
									hasSharedUrl={Boolean(lastSharedConversationUrl)}
								/>
								{shareButtonLabel}
							</Button>
						</div>
					) : null}
					{shouldShowConversationLoading ? (
						<ConversationLoadingState />
					) : shouldShowEmptyState ? (
						<ConversationEmptyState
							title="Начните разговор"
							description="Задайте любой вопрос, чтобы начать"
							icon={<HiMiniChatBubbleLeftRight className="size-8" />}
						/>
					) : (
						<AnimatePresence initial={false}>
							{renderedMessages.map((message, messageIndex) => {
								if (message.role === "user") {
									return (
										<MessageRow key={message.id} messageId={message.id}>
											<UserMessage
												message={message}
												prefixMessages={renderedMessages.slice(0, messageIndex)}
												workspaceId={workspaceId}
												workspaceCwd={workspaceCwd}
												isEditing={editingUserMessageId === message.id}
												isSubmitting={isEditSubmitting}
												onStartEdit={onStartEditUserMessage}
												onCancelEdit={onCancelEditUserMessage}
												onSubmitEdit={onSubmitEditedUserMessage}
												onRestart={onRestartUserMessage}
												actionDisabled={isAwaitingAssistant}
											/>
										</MessageRow>
									);
								}

								return (
									<MessageRow key={message.id} messageId={message.id}>
										<AssistantMessage
											message={message}
											workspaceId={workspaceId}
											sessionId={sessionId}
											organizationId={organizationId}
											workspaceCwd={workspaceCwd}
											isStreaming={false}
											previewToolParts={[]}
											{...inlineToolStateProps}
										/>
									</MessageRow>
								);
							})}
							{interruptedPreview && (
								<MessageRow
									key={interruptedPreview.id}
									messageId={interruptedPreview.id}
								>
									<AssistantMessage
										message={interruptedPreview}
										workspaceId={workspaceId}
										sessionId={sessionId}
										organizationId={organizationId}
										workspaceCwd={workspaceCwd}
										isStreaming={false}
										previewToolParts={[]}
										{...inlineToolStateProps}
										footer={<InterruptedFooter />}
									/>
								</MessageRow>
							)}
							{isRunning && currentMessage && (
								<MessageRow
									key={`current-${currentMessage.id}`}
									messageId={currentMessage.id}
									isStreaming
								>
									<AssistantMessage
										message={currentMessage}
										workspaceId={workspaceId}
										sessionId={sessionId}
										organizationId={organizationId}
										workspaceCwd={workspaceCwd}
										isStreaming
										previewToolParts={previewToolParts}
										{...inlineToolStateProps}
									/>
								</MessageRow>
							)}
						</AnimatePresence>
					)}
					{shouldShowThinking ? <ThinkingMessage /> : null}
					{shouldShowToolPreview ? (
						<ToolPreviewMessage
							previewToolParts={previewToolParts}
							workspaceId={workspaceId}
							sessionId={sessionId}
							organizationId={organizationId}
							workspaceCwd={workspaceCwd}
							pendingPlanApproval={pendingPlanApproval}
							pendingPlanToolCallId={pendingPlanToolCallId}
							isPlanSubmitting={isPlanSubmitting}
							onPlanRespond={onPlanRespond}
						/>
					) : null}
					{pendingApproval && (
						<PendingApprovalMessage
							approval={pendingApproval}
							isSubmitting={isApprovalSubmitting}
							onRespond={onApprovalRespond}
						/>
					)}
					{shouldShowStandalonePendingPlan && pendingPlanApproval && (
						<PendingPlanApprovalMessage
							planApproval={pendingPlanApproval}
							isSubmitting={isPlanSubmitting}
							onRespond={onPlanRespond}
						/>
					)}
				</div>
			</ConversationContent>
			<ChatSearch
				isOpen={chatSearch.isSearchOpen}
				query={chatSearch.query}
				caseSensitive={chatSearch.caseSensitive}
				matchCount={chatSearch.matchCount}
				activeMatchIndex={chatSearch.activeMatchIndex}
				onQueryChange={chatSearch.setQuery}
				onCaseSensitiveChange={chatSearch.setCaseSensitive}
				onFindNext={chatSearch.findNext}
				onFindPrevious={chatSearch.findPrevious}
				onClose={chatSearch.closeSearch}
			/>
			<ScrollAnchor trigger={footerScrollTrigger} />
			<MessageScrollbackRail messages={renderedMessages} />
			<ConversationScrollButton />
		</Conversation>
	);
}
