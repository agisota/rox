"use client";

import { ROX_CHAT_MODEL, ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import { selectContextUsage } from "@rox/shared/context-usage";
import { ComposerContextRing } from "@rox/ui/ai-elements/composer-context-ring";
import {
	type PromptInputMessage,
	PromptInputProvider,
	usePromptInputController,
} from "@rox/ui/ai-elements/prompt-input";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { blobToBase64, MicButton, type Recording } from "@rox/ui/voice";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuLoaderCircle, LuSparkles } from "react-icons/lu";
import { trpcClient } from "@/trpc/client";
import { IdentitySwitcherChip } from "../../../components/IdentitySwitcherChip";
import { PreviewPromptComposer } from "../../../components/PreviewPromptComposer";
import { deriveQuickChatReply } from "../../utils/deriveQuickChatReply";

interface QuickChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}

export function WebQuickChatView() {
	const [messages, setMessages] = useState<QuickChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	// One persisted chat_sessions row per conversation: generated lazily on the
	// first send and reused so the whole thread lands in one session.
	const sessionIdRef = useRef<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Gate the mic on the server-side dictation config, exactly like desktop's
	// ChatInputFooter (apiClient.voice.isConfigured). With the shared server
	// GROQ_API_KEY this is always true; the gate just hides a broken-looking mic
	// when the voice service is down/unconfigured.
	const { data: voiceConfig } = useQuery({
		queryKey: ["voice", "isConfigured"],
		queryFn: () => trpcClient.voice.isConfigured.query(),
	});
	const dictationConfigured = voiceConfig?.configured ?? false;

	const scrollToBottom = useCallback(() => {
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		});
	}, []);

	const send = useCallback(
		async (rawText: string) => {
			const text = rawText.trim();
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
		},
		[isSending, messages, scrollToBottom],
	);

	// F42: live context-usage ring, computed by the shared cross-platform
	// selector so web matches desktop/mobile for the same conversation + model.
	const contextUsage = useMemo(
		() =>
			selectContextUsage(
				messages.map((message) => message.text),
				ROX_CHAT_MODEL.id,
			),
		[messages],
	);

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
				<div className="mx-auto w-full max-w-2xl">
					{/*
					 * PromptInputProvider lifts the composer's text-input state out so
					 * the mic (WebMicButton) can read/write it via usePromptInputController.
					 * PreviewPromptComposer's inner <PromptInput> detects this provider and
					 * runs in controlled mode (clears itself on submit). Mirrors how the
					 * desktop ChatPaneInterface wraps its ChatInputFooter.
					 */}
					<PromptInputProvider>
						<PreviewPromptComposer
							containerClassName="rounded-xl border border-border bg-card p-1"
							promptInputClassName="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-none [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-transparent"
							placeholder="Напишите сообщение…"
							footerTools={
								<div className="flex items-center gap-2">
									<IdentitySwitcherChip />
									<span className="text-xs text-muted-foreground">
										{ROX_CHAT_MODEL_NAME}
									</span>
								</div>
							}
							message=""
							submitDisabled={isSending}
							enableSlashCommands
							onSubmit={(submitted: PromptInputMessage) => {
								void send(submitted.text ?? "");
							}}
							contextRing={
								<ComposerContextRing
									maxTokens={contextUsage.maxTokens}
									modelId={ROX_CHAT_MODEL.id}
									usedTokens={contextUsage.usedTokens}
								/>
							}
							footerExtras={
								<WebMicButton disabled={isSending || !dictationConfigured} />
							}
						/>
					</PromptInputProvider>
				</div>
			</div>
		</div>
	);
}

/**
 * Mic button for the web quick chat. Lives inside the composer's
 * PromptInputProvider so it can insert the recognized text straight into the
 * shared text-input controller. Transcription goes through the web tRPC client
 * (voice.transcribe → Groq Whisper, server-side key). No keyboard shortcut on
 * web (we pass no onReady), per spec.
 */
function WebMicButton({ disabled }: { disabled?: boolean }) {
	const { textInput } = usePromptInputController();
	const [transcribing, setTranscribing] = useState(false);

	const handleComplete = useCallback(
		async (recording: Recording, locked: boolean) => {
			setTranscribing(true);
			try {
				const audioBase64 = await blobToBase64(recording.blob);
				const result = await trpcClient.voice.transcribe.mutate({
					audioBase64,
					mimeType: recording.mimeType,
					durationMs: recording.durationMs,
				});
				const text = (result.processed?.ru || result.rawText || "").trim();
				if (!text) {
					toast.info("Не удалось распознать речь");
					return;
				}
				// Web has no push-to-talk auto-send: always insert for review.
				// `locked` is ignored here (kept in the signature for parity).
				void locked;
				const prev = textInput.value;
				textInput.setInput(prev ? `${prev} ${text}` : text);
				textInput.focus();
			} catch {
				toast.error("Ошибка расшифровки — запись сохранена для повтора");
			} finally {
				setTranscribing(false);
			}
		},
		[textInput],
	);

	return (
		<MicButton
			onComplete={handleComplete}
			transcribing={transcribing}
			disabled={disabled}
		/>
	);
}
