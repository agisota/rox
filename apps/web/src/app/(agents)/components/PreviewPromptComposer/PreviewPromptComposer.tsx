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
import { ArrowUpIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { MAX_FILE_SIZE, MAX_FILES } from "../../constants";
import { PlusMenu } from "../PlusMenu";

type PreviewPromptComposerProps = {
	placeholder: string;
	promptInputClassName: string;
	footerTools: ReactNode;
	containerClassName?: string;
	footerToolsClassName?: string;
	afterComposer?: ReactNode;
	header?: ReactNode;
	message?: string;
	messageClassName?: string;
	/**
	 * When provided, the composer is interactive: textarea + submit are enabled
	 * and submitting calls this. When omitted, the composer stays a read-only
	 * preview (the default for the agent-session prototype).
	 */
	onSubmit?: (message: PromptInputMessage) => void;
	/** Extra footer controls rendered left of submit (e.g. a mic button). */
	footerExtras?: ReactNode;
	/**
	 * Context-usage ring rendered in the left tools cluster, after `footerTools`
	 * (F42). A `ReactNode` so the caller owns the live token inputs.
	 */
	contextRing?: ReactNode;
	/** Submit busy/disabled state for the interactive mode. */
	submitDisabled?: boolean;
};

export function PreviewPromptComposer({
	placeholder,
	promptInputClassName,
	footerTools,
	containerClassName,
	footerToolsClassName,
	afterComposer,
	header,
	message = "Веб-интерфейс агентов пока доступен только для просмотра.",
	messageClassName,
	onSubmit,
	footerExtras,
	contextRing,
	submitDisabled,
}: PreviewPromptComposerProps) {
	const interactive = typeof onSubmit === "function";
	const noop = useCallback(() => {}, []);

	return (
		<div className={cn(containerClassName)}>
			<PromptInput
				onSubmit={onSubmit ?? noop}
				className={promptInputClassName}
				multiple
				maxFiles={MAX_FILES}
				maxFileSize={MAX_FILE_SIZE}
			>
				<PromptInputAttachments>
					{(file) => <PromptInputAttachment key={file.id} data={file} />}
				</PromptInputAttachments>
				{header ? <PromptInputHeader>{header}</PromptInputHeader> : null}
				<PromptInputTextarea
					disabled={!interactive}
					placeholder={placeholder}
					className="min-h-10"
				/>
				<PromptInputFooter>
					<PromptInputTools className={cn(footerToolsClassName)}>
						{footerTools}
						{contextRing}
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu disabled={!interactive} />
						{footerExtras}
						<PromptInputSubmit
							disabled={!interactive || submitDisabled}
							className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>
			{afterComposer}
			{message ? <p className={messageClassName}>{message}</p> : null}
		</div>
	);
}
