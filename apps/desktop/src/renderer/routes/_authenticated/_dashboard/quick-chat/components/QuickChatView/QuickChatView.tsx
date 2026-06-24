import {
	type ChatModelOption,
	ROX_CHAT_MODEL,
	ROX_CHAT_MODEL_NAME,
} from "@rox/shared/chat-models";
import {
	PromptInputProvider,
	usePromptInputController,
} from "@rox/ui/ai-elements/prompt-input";
import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuPlus, LuSettings, LuSparkles } from "react-icons/lu";
import { logger } from "renderer/lib/logger";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { useQuickChatDraftStore } from "renderer/stores/quick-chat-draft";
import { DEFAULT_SAVED_PROMPTS } from "../../../saved-prompts/components/SavedPromptsView/default-prompts";
import {
	DEFAULT_REASONING_LEVEL,
	QUICK_CHAT_MOTION,
	type ReasoningLevel,
	STARTER_PROMPT_IDS,
} from "./constants";
import { QuickChatComposer } from "./QuickChatComposer";
import { type QuickChatMessage, QuickChatMessages } from "./QuickChatMessages";
import { resolveQuickChatOutcome, shouldBlockSend } from "./quick-chat-state";

/** RU notice shown when a non-Rox model is picked but no user key is configured. */
const NEEDS_USER_KEY_NOTICE = `Для этой модели нужен ваш ключ провайдера. Откройте «Настройки → Модели», чтобы добавить ключ, либо выберите ${ROX_CHAT_MODEL_NAME} — она работает без настройки.`;
/**
 * RU banner shown when the Rox house model itself is not configured server-side.
 * Rendered as an inline actionable affordance (with a CTA to «Настройки →
 * Модели») rather than a dead assistant bubble, and send is disabled while it is
 * active so the user can't keep hitting the same dead end.
 */
const NOT_CONFIGURED_BANNER =
	`${ROX_CHAT_MODEL_NAME} сейчас недоступна — серверный ключ не настроен. ` +
	"Добавьте ключ модели в настройках или выберите другую модель со своим ключом.";
/** CTA label on the not-configured banner. */
const NOT_CONFIGURED_CTA = "Открыть «Настройки → Модели»";
const GENERIC_ERROR_NOTICE =
	"Не удалось получить ответ. Проверьте соединение и попробуйте снова.";

/**
 * Starter chips for the empty state — a curated subset of the shared
 * `DEFAULT_SAVED_PROMPTS`, kept in the saved-prompts list so both surfaces share
 * one source. Order follows `STARTER_PROMPT_IDS`; unknown ids are dropped.
 */
const STARTER_PROMPTS = STARTER_PROMPT_IDS.flatMap((id) => {
	const prompt = DEFAULT_SAVED_PROMPTS.find((entry) => entry.id === id);
	return prompt ? [prompt] : [];
});

/**
 * Quick Chat — zero-friction, project-less AI chat on the repo's AI-Elements
 * design system. `QuickChatView` owns the header chrome and the shared
 * `PromptInputProvider` (so the composer's text controller is reachable by the
 * mic and the starter/draft handoff); `QuickChatBody` owns the conversation
 * state and renders the messages + composer inside that provider.
 */
export function QuickChatView() {
	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PromptInputProvider>
				<QuickChatBody />
			</PromptInputProvider>
		</div>
	);
}

function QuickChatBody() {
	const { textInput } = usePromptInputController();
	const navigate = useNavigate();
	const prefersReducedMotion = useReducedMotion();
	const consumePrompt = useQuickChatDraftStore((state) => state.consumePrompt);

	const [model, setModel] = useState<ChatModelOption>(ROX_CHAT_MODEL);
	const [reasoning, setReasoning] = useState<ReasoningLevel>(
		DEFAULT_REASONING_LEVEL,
	);
	const [messages, setMessages] = useState<QuickChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	// Set when the house model reports `not-configured`: instead of a dead
	// assistant bubble we surface an inline actionable banner and disable send so
	// the user can fix it (add a key / switch model) rather than dead-end.
	const [notConfigured, setNotConfigured] = useState(false);
	// One persisted chat_sessions row per QuickChat conversation. Generated lazily
	// on first send and reused for the rest of the conversation so the whole thread
	// lands in a single session the Журнал can summarize.
	const sessionIdRef = useRef<string | null>(null);

	// Server-side Whisper availability (voice.isConfigured). With the shared
	// server GROQ_API_KEY this is always true; the gate just hides a dead-looking
	// mic when the voice service is down/unconfigured. Same client + query key as
	// the desktop ChatInputFooter.
	const { data: voiceConfig } = useQuery({
		queryKey: ["voice", "isConfigured"],
		queryFn: () => apiClient.voice.isConfigured.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const dictationConfigured = voiceConfig?.configured ?? false;

	// Pick up a prompt staged from the "Сохранённые промпты" view, if any, and
	// drop it straight into the shared composer controller.
	useEffect(() => {
		const staged = consumePrompt();
		if (staged) {
			textInput.setInput(staged);
			textInput.focus();
		}
	}, [consumePrompt, textInput]);

	// The composer text snapshot we restored when the house model came back
	// not-configured. We keep the user's text but disable send; the banner must
	// clear only when they actually EDIT that text (parity with the old textarea
	// onChange reset), not merely because text is present.
	const notConfiguredTextRef = useRef<string | null>(null);
	const composerValue = textInput.value;
	useEffect(() => {
		if (
			notConfigured &&
			notConfiguredTextRef.current !== null &&
			composerValue !== notConfiguredTextRef.current
		) {
			setNotConfigured(false);
			notConfiguredTextRef.current = null;
		}
	}, [notConfigured, composerValue]);

	// Fill the composer from a starter chip and focus it so the user can edit or
	// send. Reuses the same controller path as the saved-prompts draft handoff.
	const applyStarterPrompt = useCallback(
		(body: string) => {
			textInput.setInput(body);
			textInput.focus();
		},
		[textInput],
	);

	const send = useCallback(
		async (rawText: string) => {
			const text = rawText.trim();
			if (
				shouldBlockSend({
					trimmedInputLength: text.length,
					isSending,
					notConfigured,
				})
			) {
				return;
			}

			if (!sessionIdRef.current) {
				sessionIdRef.current = crypto.randomUUID();
			}
			const sessionId = sessionIdRef.current;

			const now = Date.now();
			const userMessage: QuickChatMessage = {
				id: `u-${now}`,
				role: "user",
				text,
			};
			// History sent to the model: prior turns + this one (excludes placeholders).
			const history = [...messages, userMessage].map((message) => ({
				role: message.role,
				content: message.text,
			}));

			setMessages((prev) => [...prev, userMessage]);
			setIsSending(true);

			const appendAssistant = (assistantText: string) => {
				setMessages((prev) => [
					...prev,
					{ id: `a-${now}`, role: "assistant", text: assistantText },
				]);
			};

			try {
				const result = await apiClient.chat.complete.mutate({
					sessionId,
					messages: history,
					modelId: model.id,
					reasoning,
				});

				const outcome = resolveQuickChatOutcome(result.status);
				if (outcome === "reply" && result.status === "ok") {
					appendAssistant(result.reply);
				} else if (outcome === "notice") {
					appendAssistant(NEEDS_USER_KEY_NOTICE);
				} else {
					// House model has no server key: don't append a dead assistant
					// bubble. Surface the inline actionable banner instead, drop the
					// optimistic user bubble, and restore the user's text into the
					// composer (PromptInput already cleared it on submit) so they can
					// retry after fixing it.
					setNotConfigured(true);
					setMessages((prev) =>
						prev.filter((message) => message.id !== userMessage.id),
					);
					notConfiguredTextRef.current = text;
					textInput.setInput(text);
				}
			} catch (error) {
				logger.error("[quick-chat] completion failed", error);
				appendAssistant(GENERIC_ERROR_NOTICE);
			} finally {
				setIsSending(false);
			}
		},
		[isSending, notConfigured, messages, model.id, reasoning, textInput],
	);

	const handleModelChange = useCallback((option: ChatModelOption) => {
		setModel(option);
		setNotConfigured(false);
		notConfiguredTextRef.current = null;
	}, []);

	const handleReasoningChange = useCallback((level: ReasoningLevel) => {
		setReasoning(level);
	}, []);

	// «Новый чат»: reset the ephemeral conversation. Clears messages, the session
	// id (so the next send opens a fresh chat_sessions row), the not-configured
	// banner, and the composer text.
	const handleNewChat = useCallback(() => {
		setMessages([]);
		setNotConfigured(false);
		notConfiguredTextRef.current = null;
		sessionIdRef.current = null;
		textInput.clear();
		textInput.focus();
	}, [textInput]);

	const openModelSettings = useCallback(() => {
		void navigate({ to: "/settings/models" });
	}, [navigate]);

	const submitDisabled =
		isSending || notConfigured || textInput.value.trim().length === 0;
	const composerEmpty = textInput.value.trim().length === 0;

	return (
		<>
			<header className="flex items-center gap-2 border-b border-border bg-card/40 px-6 py-4 backdrop-blur-sm">
				<LuSparkles className="size-5 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<h1 className="font-semibold text-foreground text-lg">Быстрый чат</h1>
					<p className="text-muted-foreground text-sm">
						Начните разговор сразу — без проекта и репозитория.
					</p>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 shrink-0 gap-1.5 rounded-full px-3 text-xs"
					onClick={handleNewChat}
					disabled={messages.length === 0 && composerEmpty}
				>
					<LuPlus className="size-3.5" />
					Новый чат
				</Button>
			</header>

			<QuickChatMessages
				messages={messages}
				isSending={isSending}
				modelName={model.name}
				starterPrompts={STARTER_PROMPTS}
				showStarters={composerEmpty}
				onStarterSelect={applyStarterPrompt}
			/>

			<div className="border-border border-t px-6 py-4">
				<AnimatePresence initial={false}>
					{notConfigured ? (
						<motion.div
							key="quick-chat-not-configured"
							role="alert"
							initial={
								prefersReducedMotion
									? { opacity: 0 }
									: { opacity: 0, height: 0 }
							}
							animate={
								prefersReducedMotion
									? { opacity: 1 }
									: { opacity: 1, height: "auto" }
							}
							exit={
								prefersReducedMotion
									? { opacity: 0 }
									: { opacity: 0, height: 0 }
							}
							transition={{
								duration: QUICK_CHAT_MOTION.duration,
								ease: QUICK_CHAT_MOTION.ease,
							}}
							className="mx-auto max-w-2xl overflow-hidden"
						>
							<div
								className={cn(
									"mb-2 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3",
									"sm:flex-row sm:items-center sm:justify-between",
								)}
							>
								<p className="text-muted-foreground text-xs">
									{NOT_CONFIGURED_BANNER}
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 shrink-0 gap-1.5 rounded-full px-3 text-xs"
									onClick={openModelSettings}
								>
									<LuSettings className="size-3.5" />
									{NOT_CONFIGURED_CTA}
								</Button>
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>

				<QuickChatComposer
					model={model}
					onModelChange={handleModelChange}
					reasoning={reasoning}
					onReasoningChange={handleReasoningChange}
					isSending={isSending}
					submitDisabled={submitDisabled}
					dictationConfigured={dictationConfigured}
					onSubmit={send}
				/>
			</div>
		</>
	);
}
