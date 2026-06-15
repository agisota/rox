"use client";

import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputHeader,
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
}: PreviewPromptComposerProps) {
	const handleSubmit = useCallback(() => {}, []);

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
				<PromptInputTextarea
					disabled
					placeholder={placeholder}
					className="min-h-10"
				/>
				<PromptInputFooter>
					<PromptInputTools className={cn(footerToolsClassName)}>
						{footerTools}
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu disabled />
						<PromptInputSubmit
							disabled
							className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>
			{afterComposer}
			<p className={messageClassName}>{message}</p>
		</div>
	);
}
