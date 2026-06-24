import {
	AVAILABLE_CHAT_MODELS,
	type ChatModelOption,
	isRoxHouseModel,
	ROX_CHAT_MODEL_NAME,
} from "@rox/shared/chat-models";
import {
	PromptInput,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController,
} from "@rox/ui/ai-elements/prompt-input";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { blobToBase64, MicButton, type Recording } from "@rox/ui/voice";
import { useCallback, useState } from "react";
import { LuArrowUp, LuChevronDown } from "react-icons/lu";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { REASONING_LEVELS, type ReasoningLevel } from "./constants";

interface QuickChatComposerProps {
	model: ChatModelOption;
	onModelChange: (model: ChatModelOption) => void;
	reasoning: ReasoningLevel;
	onReasoningChange: (level: ReasoningLevel) => void;
	isSending: boolean;
	/** True when send must be blocked (house model not configured). */
	submitDisabled: boolean;
	/** Whether the server-side dictation key is present (voice.isConfigured). */
	dictationConfigured: boolean;
	onSubmit: (text: string) => void;
}

/**
 * Quick Chat composer. Built on the SAME shared ai-elements `PromptInput`
 * primitives the web twin and desktop ChatInputFooter use, so motion, Enter /
 * Shift+Enter, and the controlled clear-on-submit behavior match the rest of
 * Rox. Must be rendered inside a `<PromptInputProvider>` (the mic reads/writes
 * the shared text controller). Glass: `bg-card/60 backdrop-blur` to read as a
 * floating dock over the workspace glass.
 */
export function QuickChatComposer({
	model,
	onModelChange,
	reasoning,
	onReasoningChange,
	isSending,
	submitDisabled,
	dictationConfigured,
	onSubmit,
}: QuickChatComposerProps) {
	const isHouseModel = isRoxHouseModel(model.id);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
			onSubmit(message.text ?? "");
		},
		[onSubmit],
	);

	return (
		<div className="mx-auto w-full max-w-2xl">
			<PromptInput
				onSubmit={handleSubmit}
				className="rounded-xl border border-border bg-card/60 p-1 backdrop-blur [&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-none [&>[data-slot=input-group]]:bg-transparent [&>[data-slot=input-group]]:shadow-none"
			>
				<PromptInputTextarea
					placeholder="Напишите сообщение…"
					className="min-h-16 bg-transparent"
				/>
				<PromptInputFooter>
					<PromptInputTools>
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
								className="max-h-72 overflow-y-auto border-border/60 bg-popover/80 backdrop-blur"
							>
								{AVAILABLE_CHAT_MODELS.map((option) => (
									<DropdownMenuItem
										key={option.id}
										onSelect={() => onModelChange(option)}
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
									onClick={() => onReasoningChange(level)}
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
					</PromptInputTools>

					<div className="flex items-center gap-2">
						<QuickChatMicButton disabled={isSending || !dictationConfigured} />
						<PromptInputSubmit
							disabled={submitDisabled}
							status={isSending ? "submitted" : undefined}
							className="size-8 rounded-full"
						>
							<LuArrowUp className="size-4" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>

			{!isHouseModel ? (
				<p className="px-1 pt-1.5 text-[11px] text-muted-foreground">
					{ROX_CHAT_MODEL_NAME} работает без настройки. Для {model.name} нужен
					ваш ключ провайдера.
				</p>
			) : null}
		</div>
	);
}

/**
 * Dictation mic for Quick Chat. Lives inside the composer's
 * `PromptInputProvider` so it can insert the recognized text straight into the
 * shared text controller. Mirrors the desktop ChatInputFooter handler verbatim
 * (apiClient.voice.transcribe → Groq Whisper, server key). Desktop has no
 * push-to-talk auto-send here: always insert for review.
 */
function QuickChatMicButton({ disabled }: { disabled?: boolean }) {
	const { textInput } = usePromptInputController();
	const [transcribing, setTranscribing] = useState(false);

	const handleComplete = useCallback(
		async (recording: Recording, locked: boolean) => {
			setTranscribing(true);
			try {
				const audioBase64 = await blobToBase64(recording.blob);
				const result = await apiClient.voice.transcribe.mutate({
					audioBase64,
					mimeType: recording.mimeType,
					durationMs: recording.durationMs,
				});
				const text = (result.processed?.ru || result.rawText || "").trim();
				if (!text) {
					toast.info("Не удалось распознать речь");
					return;
				}
				// Quick Chat never auto-sends from voice: insert for review.
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
