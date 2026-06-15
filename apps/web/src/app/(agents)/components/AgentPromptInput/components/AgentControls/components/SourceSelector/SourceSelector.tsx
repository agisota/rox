"use client";

import {
	PromptInputButton,
	PromptInputCommand,
	PromptInputCommandEmpty,
	PromptInputCommandGroup,
	PromptInputCommandInput,
	PromptInputCommandItem,
	PromptInputCommandList,
} from "@rox/ui/ai-elements/prompt-input";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { Boxes, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { AgentSourceOption } from "../../../../hooks/useAgentControls";

type SourceSelectorProps = {
	sources: AgentSourceOption[];
	pending: boolean;
	error: unknown | null;
	onRetry: () => void;
	selectedSource: AgentSourceOption | null;
	onSelect: (sourceId: string | null) => void;
};

export function SourceSelector({
	sources,
	pending,
	error,
	onRetry,
	selectedSource,
	onSelect,
}: SourceSelectorProps) {
	const [open, setOpen] = useState(false);
	const hasError = Boolean(error);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PromptInputButton
					aria-label="Выбрать источник"
					aria-haspopup="listbox"
				>
					<Boxes className="size-3.5" />
					<span>{selectedSource ? selectedSource.name : "Источник"}</span>
				</PromptInputButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<PromptInputCommand>
					<PromptInputCommandInput placeholder="Поиск источника…" />
					<PromptInputCommandList>
						<PromptInputCommandEmpty>
							{hasError
								? "Не удалось загрузить источники"
								: pending
									? "Загрузка…"
									: "Источники не найдены"}
						</PromptInputCommandEmpty>
						<PromptInputCommandGroup>
							{hasError && (
								<PromptInputCommandItem
									value="__retry_sources__"
									onSelect={onRetry}
								>
									<RefreshCw className="size-3.5 text-muted-foreground" />
									<span className="flex-1">Повторить загрузку</span>
								</PromptInputCommandItem>
							)}
							{selectedSource && (
								<PromptInputCommandItem
									value="__none__"
									onSelect={() => {
										onSelect(null);
										setOpen(false);
									}}
								>
									<span className="text-muted-foreground">Без источника</span>
								</PromptInputCommandItem>
							)}
							{sources.map((source) => (
								<PromptInputCommandItem
									key={source.id}
									value={`${source.name} ${source.slug}`}
									onSelect={() => {
										onSelect(source.id);
										setOpen(false);
									}}
								>
									<Boxes className="size-3.5 text-muted-foreground" />
									<span className="flex-1 truncate">{source.name}</span>
									{selectedSource?.id === source.id && (
										<Check className="size-3.5 text-primary" />
									)}
								</PromptInputCommandItem>
							))}
						</PromptInputCommandGroup>
					</PromptInputCommandList>
				</PromptInputCommand>
			</PopoverContent>
		</Popover>
	);
}
