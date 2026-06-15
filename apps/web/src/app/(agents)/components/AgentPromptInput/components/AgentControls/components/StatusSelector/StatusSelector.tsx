"use client";

import {
	PromptInputSelect,
	PromptInputSelectContent,
	PromptInputSelectItem,
	PromptInputSelectTrigger,
	PromptInputSelectValue,
} from "@rox/ui/ai-elements/prompt-input";
import { CircleDot } from "lucide-react";
import type { ChatSessionStatusValue } from "../../../../hooks/useAgentControls";

type StatusSelectorProps = {
	status: ChatSessionStatusValue;
	options: ChatSessionStatusValue[];
	onChange: (status: ChatSessionStatusValue) => void;
};

const STATUS_LABEL: Record<ChatSessionStatusValue, string> = {
	active: "Активна",
	archived: "В архиве",
};

function isStatusOption(
	value: string,
	options: readonly ChatSessionStatusValue[],
): value is ChatSessionStatusValue {
	return options.some((option) => option === value);
}

/** Chat-session status (inbox/archive), backed by the `chatSessionStatus` enum. */
export function StatusSelector({
	status,
	options,
	onChange,
}: StatusSelectorProps) {
	return (
		<PromptInputSelect
			value={status}
			onValueChange={(value) => {
				if (isStatusOption(value, options)) {
					onChange(value);
				}
			}}
		>
			<PromptInputSelectTrigger
				aria-label="Статус сессии"
				className="h-7 gap-1.5 px-2 text-xs"
			>
				<CircleDot className="size-3.5" />
				<PromptInputSelectValue />
			</PromptInputSelectTrigger>
			<PromptInputSelectContent>
				{options.map((option) => (
					<PromptInputSelectItem key={option} value={option}>
						{STATUS_LABEL[option]}
					</PromptInputSelectItem>
				))}
			</PromptInputSelectContent>
		</PromptInputSelect>
	);
}
