"use client";

import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@rox/ui/ai-elements/prompt-input";
import { cn } from "@rox/ui/utils";
import { type ReactNode, useCallback, useState } from "react";
import { MAX_FILE_SIZE, MAX_FILES } from "../../constants";
import { PlusMenu } from "../PlusMenu";

/**
 * A REAL, write-capable prompt composer for the web `(agents)` surface — the
 * working counterpart of {@link import("../PreviewPromptComposer").PreviewPromptComposer}
 * (which hard-disables every control and no-ops its submit). It reuses the same
 * `@rox/ui` `PromptInput` primitives so the layout/styling stay identical, but
 * the textarea, attachments (`PlusMenu`) and submit are ENABLED and `onSend`
 * dispatches the message.
 *
 * `onSend` is awaited; `PromptInput` clears the composer optimistically on
 * submit and restores the draft if `onSend` rejects (prompt-input.tsx:880-901),
 * so a capability-absent host surfaces as a restored draft + inline error
 * rather than a lost message or a crash. The send state also drives the submit
 * button's `status` (spinner while sending, error glyph on failure).
 */
export type WorkingPromptComposerProps = {
	/** Dispatch the composed message. Reject to signal a failed send. */
	onSend: (message: PromptInputMessage) => Promise<void>;
	placeholder: string;
	promptInputClassName: string;
	footerTools: ReactNode;
	containerClassName?: string;
	footerToolsClassName?: string;
	afterComposer?: ReactNode;
	header?: ReactNode;
	messageClassName?: string;
};

export function WorkingPromptComposer({
	onSend,
	placeholder,
	promptInputClassName,
	footerTools,
	containerClassName,
	footerToolsClassName,
	afterComposer,
	header,
	messageClassName,
}: WorkingPromptComposerProps) {
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const hasText = message.text.trim().length > 0;
			const hasFiles = message.files.length > 0;
			if (!hasText && !hasFiles) {
				return;
			}
			setSending(true);
			setError(null);
			try {
				await onSend(message);
			} catch (caught) {
				// Capability-absent / relay error: surface inline, never crash. The
				// PromptInput restores the draft because we re-throw.
				setError(caught instanceof Error ? caught.message : String(caught));
				throw caught;
			} finally {
				setSending(false);
			}
		},
		[onSend],
	);

	return (
		<div className={cn(containerClassName)}>
			<PromptInput
				onSubmit={handleSubmit}
				className={promptInputClassName}
				multiple
				maxFiles={MAX_FILES}
				maxFileSize={MAX_FILE_SIZE}
			>
				<PromptInputAttachments>
					{(file) => <PromptInputAttachment key={file.id} data={file} />}
				</PromptInputAttachments>
				{header ? <PromptInputHeader>{header}</PromptInputHeader> : null}
				<PromptInputTextarea placeholder={placeholder} className="min-h-10" />
				<PromptInputFooter>
					<PromptInputTools className={cn(footerToolsClassName)}>
						{footerTools}
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu />
						<PromptInputSubmit
							status={sending ? "submitted" : error ? "error" : undefined}
							className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
						/>
					</div>
				</PromptInputFooter>
			</PromptInput>
			{afterComposer}
			{error ? (
				<p role="alert" className={cn("text-destructive", messageClassName)}>
					Не удалось отправить: {error}
				</p>
			) : null}
		</div>
	);
}
