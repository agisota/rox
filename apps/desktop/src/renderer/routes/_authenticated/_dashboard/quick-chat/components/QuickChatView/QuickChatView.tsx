import {
	AVAILABLE_CHAT_MODELS,
	isRoxHouseModel,
	ROX_CHAT_MODEL,
	ROX_CHAT_MODEL_NAME,
} from "@rox/shared/chat-models";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LuArrowUp,
	LuChevronDown,
	LuLoaderCircle,
	LuSparkles,
} from "react-icons/lu";
import { logger } from "renderer/lib/logger";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { useQuickChatDraftStore } from "renderer/stores/quick-chat-draft";
import {
	DEFAULT_REASONING_LEVEL,
	REASONING_LEVELS,
	type ReasoningLevel,
} from "./constants";

interface QuickChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}

/** RU notice shown when a non-Rox model is picked but no user key is configured. */
const NEEDS_USER_KEY_NOTICE = `Для этой модели нужен ваш ключ провайдера. Откройте «Настройки → Модели», чтобы добавить ключ, либо выберите ${ROX_CHAT_MODEL_NAME} — она работает без настройки.`;
/** RU notice shown when the Rox house model itself is not configured server-side. */
const NOT_CONFIGURED_NOTICE =
	"Модель пока недоступна. Попробуйте позже или обратитесь к администратору.";
const GENERIC_ERROR_NOTICE =
	"Не удалось получить ответ. Проверьте соединение и попробуйте снова.";

export function QuickChatView() {
	const consumePrompt = useQuickChatDraftStore((state) => state.consumePrompt);

	const [model, setModel] = useState(ROX_CHAT_MODEL);
	const [reasoning, setReasoning] = useState<ReasoningLevel>(
		DEFAULT_REASONING_LEVEL,
	);
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<QuickChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	// One persisted chat_sessions row per QuickChat conversation. Generated lazily
	// on first send and reused for the rest of the conversation so the whole thread
	// lands in a single session the Журнал can summarize.
	const sessionIdRef = useRef<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Pick up a prompt staged from the "Сохранённые промпты" view, if any.
	useEffect(() => {
		const staged = consumePrompt();
		if (staged) setInput(staged);
	}, [consumePrompt]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, []);

	const scrollToBottom = useCallback(() => {
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		});
	}, []);

	const send = useCallback(async () => {
		const text = input.trim();
		if (text.length === 0 || isSending) return;

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
		setInput("");
		setIsSending(true);
		scrollToBottom();

		const appendAssistant = (assistantText: string) => {
			setMessages((prev) => [
				...prev,
				{ id: `a-${now}`, role: "assistant", text: assistantText },
			]);
			scrollToBottom();
		};

		try {
			const result = await apiClient.chat.complete.mutate({
				sessionId,
				messages: history,
				modelId: model.id,
				reasoning,
			});

			if (result.status === "ok") {
				appendAssistant(result.reply);
			} else if (result.status === "needs-user-key") {
				appendAssistant(NEEDS_USER_KEY_NOTICE);
			} else {
				appendAssistant(NOT_CONFIGURED_NOTICE);
			}
		} catch (error) {
			logger.error("[quick-chat] completion failed", error);
			appendAssistant(GENERIC_ERROR_NOTICE);
		} finally {
			setIsSending(false);
		}
	}, [input, isSending, messages, model.id, reasoning, scrollToBottom]);

	const isEmpty = messages.length === 0;
	const isHouseModel = isRoxHouseModel(model.id);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex items-center gap-2 border-b border-border px-6 py-4">
				<LuSparkles className="size-5 text-muted-foreground" />
				<div className="min-w-0">
					<h1 className="text-lg font-semibold text-foreground">Быстрый чат</h1>
					<p className="text-sm text-muted-foreground">
						Начните разговор сразу — без проекта и репозитория.
					</p>
				</div>
			</header>

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
				<div className="mx-auto flex max-w-2xl flex-col gap-4">
					{isEmpty ? (
						<div className="mt-12 flex flex-col items-center gap-2 text-center">
							<LuSparkles className="size-8 text-muted-foreground/60" />
							<p className="text-base font-medium text-foreground">
								Чем помочь?
							</p>
							<p className="max-w-md text-sm text-muted-foreground">
								Задайте вопрос модели {ROX_CHAT_MODEL.name}. Это обычный чат —
								проект создавать не нужно.
							</p>
						</div>
					) : (
						messages.map((message) => (
							<div
								key={message.id}
								className={cn(
									"flex",
									message.role === "user" ? "justify-end" : "justify-start",
								)}
							>
								<div
									className={cn(
										"max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm select-text",
										message.role === "user"
											? "bg-primary text-primary-foreground"
											: "bg-muted text-foreground",
									)}
								>
									{message.text}
								</div>
							</div>
						))
					)}
					{isSending ? (
						<div className="flex justify-start">
							<div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
								<LuLoaderCircle className="size-4 animate-spin" />
								{model.name} печатает…
							</div>
						</div>
					) : null}
				</div>
			</div>

			<div className="border-t border-border px-6 py-4">
				<div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-card p-2">
					<Textarea
						value={input}
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void send();
							}
						}}
						placeholder="Напишите сообщение…"
						className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
					/>
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-7 gap-1 rounded-full px-2.5 text-xs"
								>
									{model.name}
									<LuChevronDown className="size-3" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="max-h-72 overflow-y-auto"
							>
								{AVAILABLE_CHAT_MODELS.map((option) => (
									<DropdownMenuItem
										key={option.id}
										onSelect={() => setModel(option)}
										className={cn(option.id === model.id && "font-medium")}
									>
										{option.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>

						<div className="flex items-center gap-0.5 rounded-full border border-border p-0.5">
							{REASONING_LEVELS.map((level) => (
								<button
									key={level}
									type="button"
									onClick={() => setReasoning(level)}
									className={cn(
										"rounded-full px-2 py-0.5 text-[11px] transition-colors",
										level === reasoning
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{level}
								</button>
							))}
						</div>

						<Button
							size="icon"
							className="ml-auto size-8 rounded-full"
							disabled={input.trim().length === 0 || isSending}
							onClick={() => void send()}
							aria-label="Отправить"
						>
							{isSending ? (
								<LuLoaderCircle className="size-4 animate-spin" />
							) : (
								<LuArrowUp className="size-4" />
							)}
						</Button>
					</div>
					{!isHouseModel ? (
						<p className="px-1 text-[11px] text-muted-foreground">
							{ROX_CHAT_MODEL_NAME} работает без настройки. Для {model.name}{" "}
							нужен ваш ключ провайдера.
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
