import { chatServiceTrpc } from "@rox/chat/client";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	type PromptInputMessage,
	usePromptInputController,
} from "@rox/ui/ai-elements/prompt-input";
import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import { toast } from "@rox/ui/sonner";
import type { ChatStatus, FileUIPart } from "ai";
import type React from "react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusPromptOnPane } from "renderer/components/Chat/ChatInterface/hooks/useFocusPromptOnPane";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { blobToBase64 } from "renderer/lib/voice/audioToBase64";
import type { Recording } from "renderer/lib/voice/useDictation";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import type { SlashCommand } from "../../hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "../../types";
import { TiptapPromptEditor } from "../TiptapPromptEditor";
import { ChatComposerControls } from "./components/ChatComposerControls";
import { ChatInputDropZone } from "./components/ChatInputDropZone";
import { ChatShortcuts } from "./components/ChatShortcuts";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { LinkedIssues } from "./components/LinkedIssues";
import { QuestionInputOverlay } from "./components/QuestionInputOverlay";
import type { LinkedIssue } from "./types";
import { getErrorMessage } from "./utils/getErrorMessage";

interface ChatInputFooterProps {
	cwd: string;
	isFocused: boolean;
	error: unknown;
	canAbort: boolean;
	submitStatus?: ChatStatus;
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption | null>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	slashCommands: SlashCommand[];
	submitDisabled?: boolean;
	renderAttachment?: (file: FileUIPart & { id: string }) => ReactNode;
	onSubmitStart?: () => void;
	onSubmitEnd?: () => void;
	onSend: (message: PromptInputMessage) => Promise<void> | void;
	onStop: (e: React.MouseEvent) => void;
	pendingQuestion?: {
		questionId: string;
		question: string;
		description?: string;
		options?: { label: string; description?: string }[];
	} | null;
	isQuestionSubmitting?: boolean;
	onQuestionRespond?: (questionId: string, answer: string) => Promise<void>;
	onQuestionCancel?: () => void;
}

export function ChatInputFooter({
	cwd,
	isFocused,
	error,
	canAbort,
	submitStatus,
	availableModels,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingLevel,
	setThinkingLevel,
	slashCommands,
	submitDisabled,
	renderAttachment,
	onSubmitStart,
	onSubmitEnd,
	onSend,
	onStop,
	pendingQuestion,
	isQuestionSubmitting,
	onQuestionRespond,
	onQuestionCancel,
}: ChatInputFooterProps) {
	useFocusPromptOnPane(isFocused);

	// Focus the prompt when the question overlay dismisses (pendingQuestion → null).
	// Uses rAF so the editor has time to mount, register its ref, and browser
	// focus-stealing from the unmounting overlay has settled.
	const { textInput } = usePromptInputController();
	const prevPendingQuestionRef = useRef(pendingQuestion);
	useEffect(() => {
		const prev = prevPendingQuestionRef.current;
		prevPendingQuestionRef.current = pendingQuestion;
		if (prev != null && pendingQuestion == null) {
			const id = requestAnimationFrame(() => textInput.focus());
			return () => cancelAnimationFrame(id);
		}
	}, [pendingQuestion, textInput]);

	const [linkedIssues, setLinkedIssues] = useState<LinkedIssue[]>([]);
	const inputRootRef = useRef<HTMLDivElement>(null);
	const errorMessage = getErrorMessage(error);
	const focusShortcutText = useHotkeyDisplay("FOCUS_CHAT_INPUT").text;
	const showFocusHint = focusShortcutText !== "Unassigned";

	const removeLinkedIssue = useCallback((slug: string) => {
		setLinkedIssues((prev) => prev.filter((issue) => issue.slug !== slug));
	}, []);

	const trpcUtils = chatServiceTrpc.useUtils();
	const electronUtils = electronTrpc.useUtils();
	const searchFiles = useCallback(
		async (query: string) => {
			const results = await trpcUtils.workspace.searchFiles.fetch({
				rootPath: cwd,
				query,
				includeHidden: false,
				limit: 20,
			});
			return results.map((r) => ({
				id: r.id,
				name: r.name,
				relativePath: r.relativePath,
			}));
		},
		[trpcUtils, cwd],
	);
	const previewSlashCommand = useCallback(
		async (text: string) => {
			const result = await trpcUtils.workspace.previewSlashCommand.fetch({
				cwd,
				text,
			});
			return result ?? null;
		},
		[trpcUtils, cwd],
	);

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			if (linkedIssues.length === 0) return onSend(message);

			const prefix = linkedIssues
				.map((issue) => `@task:${issue.slug}`)
				.join(" ");
			const modifiedMessage: PromptInputMessage = {
				...message,
				text: `${prefix} ${message.text}`,
			};
			setLinkedIssues([]);
			return onSend(modifiedMessage);
		},
		[linkedIssues, onSend],
	);

	const [transcribing, setTranscribing] = useState(false);
	const handleDictationComplete = useCallback(
		async (recording: Recording, locked: boolean) => {
			setTranscribing(true);
			try {
				const audioBase64 = await blobToBase64(recording.blob);
				// Pre-supplied context (Settings → Voice) so the post-process model
				// can resolve names/jargon/intent. Fetched fresh per dictation;
				// empty/missing is fine and simply omitted.
				const voiceAgentContext =
					await electronUtils.settings.getVoiceAgentContext
						.fetch()
						.catch(() => "");
				const result = await apiClient.voice.transcribe.mutate({
					audioBase64,
					mimeType: recording.mimeType,
					durationMs: recording.durationMs,
					voiceAgentContext: voiceAgentContext?.trim() || undefined,
				});
				const text = (result.processed?.ru || result.rawText || "").trim();
				if (!text) {
					toast.info("Не удалось распознать речь");
					return;
				}
				if (locked) {
					// Toggle-lock: insert into the composer for review before sending.
					const prev = textInput.value;
					textInput.setInput(prev ? `${prev} ${text}` : text);
					textInput.focus();
				} else {
					// Push-to-talk: release sends immediately.
					void handleSend({ text, files: [] });
				}
			} catch {
				toast.error("Ошибка расшифровки — запись сохранена для повтора");
			} finally {
				setTranscribing(false);
			}
		},
		[textInput, handleSend, electronUtils],
	);

	return (
		<ChatInputDropZone className="relative bg-background px-4 pb-3 before:pointer-events-none before:absolute before:left-0 before:right-3 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-background before:to-transparent">
			{(dragType) => (
				<div className="mx-auto w-full max-w-[680px]">
					{errorMessage && (
						<p
							role="alert"
							className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
						>
							{errorMessage}
						</p>
					)}
					{pendingQuestion && onQuestionRespond && onQuestionCancel ? (
						<QuestionInputOverlay
							question={pendingQuestion}
							isSubmitting={isQuestionSubmitting ?? false}
							onRespond={onQuestionRespond}
							onCancel={onQuestionCancel}
						/>
					) : (
						<div
							ref={inputRootRef}
							className={
								dragType === "path"
									? "relative opacity-50 transition-opacity"
									: "relative"
							}
						>
							<PromptInput
								className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
								onSubmitStart={onSubmitStart}
								onSubmitEnd={onSubmitEnd}
								onSubmit={handleSend}
								multiple
								maxFiles={5}
								maxFileSize={10 * 1024 * 1024}
								globalDrop
							>
								<ChatShortcuts isFocused={isFocused} />
								<FileDropOverlay visible={dragType === "files"} />
								<PromptInputAttachments>
									{renderAttachment ??
										((file) => <PromptInputAttachment data={file} />)}
								</PromptInputAttachments>
								<LinkedIssues
									issues={linkedIssues}
									onRemove={removeLinkedIssue}
								/>
								<TiptapPromptEditor
									cwd={cwd}
									searchFiles={searchFiles}
									previewSlashCommand={previewSlashCommand}
									slashCommands={slashCommands}
									availableModels={availableModels}
									placeholder="Попросите внести изменения, @упомяните файлы, запустите /команды"
									focusShortcutText={
										showFocusHint ? focusShortcutText : undefined
									}
								/>
								<ChatComposerControls
									availableModels={availableModels}
									selectedModel={selectedModel}
									setSelectedModel={setSelectedModel}
									modelSelectorOpen={modelSelectorOpen}
									setModelSelectorOpen={setModelSelectorOpen}
									permissionMode={permissionMode}
									setPermissionMode={setPermissionMode}
									thinkingLevel={thinkingLevel}
									setThinkingLevel={setThinkingLevel}
									canAbort={canAbort}
									submitStatus={submitStatus}
									submitDisabled={submitDisabled}
									onStop={onStop}
									onDictationComplete={handleDictationComplete}
									dictationTranscribing={transcribing}
								/>
							</PromptInput>
						</div>
					)}
					<div className="py-1.5" />
				</div>
			)}
		</ChatInputDropZone>
	);
}
