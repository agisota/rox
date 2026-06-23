"use client";

import { ROX_CHAT_MODEL, ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import { Button } from "@rox/ui/button";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useCallback, useRef, useState } from "react";
import { LuArrowUp, LuLoaderCircle, LuSparkles } from "react-icons/lu";
import { trpcClient } from "@/trpc/client";
import { deriveQuickChatReply } from "../../utils/deriveQuickChatReply";

interface QuickChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}

export function WebQuickChatView() {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<QuickChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	// One persisted chat_sessions row per conversation: generated lazily on the
	// first send and reused so the whole thread lands in one session.
	const sessionIdRef = useRef<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

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
			const result = await trpcClient.chat.complete.mutate({
				sessionId,
				messages: history,
				modelId: ROX_CHAT_MODEL.id,
			});
			appendAssistant(deriveQuickChatReply(result));
		} catch {
			appendAssistant(deriveQuickChatReply(null));
		} finally {
			setIsSending(false);
		}
	}, [input, isSending, messages, scrollToBottom]);

	const isEmpty = messages.length === 0;

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
								Задайте вопрос модели {ROX_CHAT_MODEL_NAME}. Это обычный чат —
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
										"max-w-[85%] select-text whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
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
								{ROX_CHAT_MODEL_NAME} печатает…
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
				</div>
			</div>
		</div>
	);
}
