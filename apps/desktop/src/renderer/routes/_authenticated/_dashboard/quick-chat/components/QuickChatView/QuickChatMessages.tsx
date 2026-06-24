import { ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@rox/ui/ai-elements/conversation";
import { Loader } from "@rox/ui/ai-elements/loader";
import {
	Message,
	MessageAction,
	MessageActions,
	MessageResponse,
} from "@rox/ui/ai-elements/message";
import { Suggestion, Suggestions } from "@rox/ui/ai-elements/suggestion";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LuCheck, LuCopy, LuSparkles } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { QUICK_CHAT_MOTION } from "./constants";

export interface QuickChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}

interface StarterPrompt {
	id: string;
	title: string;
	body: string;
}

interface QuickChatMessagesProps {
	messages: QuickChatMessage[];
	isSending: boolean;
	modelName: string;
	/** Starter chips for the empty state; hidden once the composer has text. */
	starterPrompts: StarterPrompt[];
	/** Whether to show the starter row (composer empty). */
	showStarters: boolean;
	onStarterSelect: (body: string) => void;
}

/**
 * Quick Chat scroll log. Replaces the old hand-rolled `scrollRef` +
 * `requestAnimationFrame` block with the repo's `Conversation` primitive
 * (use-stick-to-bottom): auto-pin-to-bottom, `[overflow-anchor:none]`, and the
 * motion "вниз" pill for free. Assistant bubbles render markdown via
 * `MessageResponse` (streamdown); user bubbles stay plain pre-wrap.
 */
export function QuickChatMessages({
	messages,
	isSending,
	modelName,
	starterPrompts,
	showStarters,
	onStarterSelect,
}: QuickChatMessagesProps) {
	const isEmpty = messages.length === 0;

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-2xl gap-4 px-6 py-6">
				{isEmpty ? (
					<ConversationEmptyState className="mt-12 gap-2">
						<LuSparkles className="size-8 text-muted-foreground/60" />
						<div className="space-y-1">
							<h3 className="font-medium text-base text-foreground">
								Чем помочь?
							</h3>
							<p className="max-w-md text-muted-foreground text-sm">
								Задайте вопрос модели {ROX_CHAT_MODEL_NAME}. Это обычный чат —
								проект создавать не нужно.
							</p>
						</div>
						{showStarters && starterPrompts.length > 0 ? (
							<Suggestions className="mt-4 justify-center">
								{starterPrompts.map((prompt) => (
									<Suggestion
										key={prompt.id}
										suggestion={prompt.body}
										onClick={onStarterSelect}
										className="h-7 px-3 text-muted-foreground text-xs hover:text-foreground"
									>
										{prompt.title}
									</Suggestion>
								))}
							</Suggestions>
						) : null}
					</ConversationEmptyState>
				) : (
					<AnimatePresence initial={false}>
						{messages.map((message) => (
							<QuickChatBubble key={message.id} message={message} />
						))}
					</AnimatePresence>
				)}

				{isSending ? <TypingIndicator modelName={modelName} /> : null}
			</ConversationContent>

			<ConversationScrollButton />
		</Conversation>
	);
}

/**
 * One chat bubble. Keeps the surface's color contract (user = primary, right;
 * assistant = muted, left; max-w-[85%], rounded-2xl, select-text). Assistant
 * text is markdown (MessageResponse); user text is plain pre-wrap. Enter motion
 * uses the shared QUICK_CHAT_MOTION token and degrades to opacity-only under
 * reduced motion.
 */
function QuickChatBubble({ message }: { message: QuickChatMessage }) {
	const prefersReducedMotion = useReducedMotion();
	const isUser = message.role === "user";
	const { copyToClipboard, copied } = useCopyToClipboard();

	const handleCopy = () => {
		void copyToClipboard(message.text).then(() => {
			toast.success("Скопировано");
		});
	};

	return (
		<motion.div
			layout={!prefersReducedMotion}
			initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			transition={{
				duration: QUICK_CHAT_MOTION.duration,
				ease: QUICK_CHAT_MOTION.ease,
			}}
			// `group` here (not on <Message>) so the assistant copy action, which is
			// a sibling of the bubble, reveals on hover of the whole row.
			className={cn(
				"group/bubble flex flex-col",
				isUser ? "items-end" : "items-start",
			)}
		>
			<Message from={message.role} className="w-full">
				{/*
				 * Explicit bubble shell (not MessageContent) so the surface's color
				 * contract is guaranteed: user = bg-primary, assistant = bg-muted.
				 * MessageContent injects its own is-user chrome (bg-secondary) which
				 * would fight bg-primary. Markdown still renders via MessageResponse.
				 */}
				<div
					className={cn(
						"max-w-[85%] rounded-2xl px-4 py-2.5 text-sm select-text",
						isUser
							? "ml-auto bg-primary text-primary-foreground"
							: "bg-muted text-foreground",
					)}
				>
					{isUser ? (
						<p className="whitespace-pre-wrap break-words">{message.text}</p>
					) : (
						<MessageResponse>{message.text}</MessageResponse>
					)}
				</div>
			</Message>

			{!isUser ? (
				<MessageActions className="mt-1 px-1 opacity-0 transition-opacity group-hover/bubble:opacity-100">
					<MessageAction
						tooltip="Скопировать"
						label="Скопировать"
						onClick={handleCopy}
					>
						{copied ? (
							<LuCheck className="size-3.5" />
						) : (
							<LuCopy className="size-3.5" />
						)}
					</MessageAction>
				</MessageActions>
			) : null}
		</motion.div>
	);
}

/** Typing loader bubble (assistant side). Fades in/out with the shared token. */
function TypingIndicator({ modelName }: { modelName: string }) {
	const prefersReducedMotion = useReducedMotion();

	return (
		<motion.div
			initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			transition={{
				duration: QUICK_CHAT_MOTION.duration,
				ease: QUICK_CHAT_MOTION.ease,
			}}
			className="flex justify-start"
		>
			<div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-muted-foreground text-sm">
				<Loader size={14} />
				{modelName} печатает…
			</div>
		</motion.div>
	);
}
