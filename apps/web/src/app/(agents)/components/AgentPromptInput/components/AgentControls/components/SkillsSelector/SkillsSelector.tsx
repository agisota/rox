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
import { Check, Wrench } from "lucide-react";
import { useState } from "react";
import type { SkillBindingOption } from "../../../../hooks/useAgentControls";

type SkillsSelectorProps = {
	skillBindings: SkillBindingOption[];
	pending: boolean;
	selectedSkillBindings: SkillBindingOption[];
	onToggle: (bindingId: string) => void;
};

const SURFACE_LABEL: Record<SkillBindingOption["surface"], string> = {
	agent_tool: "инструмент",
	mcp: "MCP",
};

/**
 * Multi-select of skill bindings exposed on the agent_tool/mcp surfaces. Toggles
 * stay open so several skills can be picked in one go.
 */
export function SkillsSelector({
	skillBindings,
	pending,
	selectedSkillBindings,
	onToggle,
}: SkillsSelectorProps) {
	const [open, setOpen] = useState(false);
	const selectedIds = new Set(
		selectedSkillBindings.map((binding) => binding.id),
	);
	const count = selectedSkillBindings.length;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PromptInputButton aria-label="Выбрать навыки" aria-haspopup="listbox">
					<Wrench className="size-3.5" />
					<span>{count > 0 ? `Навыки · ${count}` : "Навыки"}</span>
				</PromptInputButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<PromptInputCommand>
					<PromptInputCommandInput placeholder="Поиск навыка…" />
					<PromptInputCommandList>
						<PromptInputCommandEmpty>
							{pending ? "Загрузка…" : "Навыки не найдены"}
						</PromptInputCommandEmpty>
						<PromptInputCommandGroup>
							{skillBindings.map((binding) => (
								<PromptInputCommandItem
									key={binding.id}
									value={`${binding.label} ${binding.surface}`}
									onSelect={() => onToggle(binding.id)}
								>
									<span className="flex-1 truncate">{binding.label}</span>
									<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
										{SURFACE_LABEL[binding.surface]}
									</span>
									{selectedIds.has(binding.id) && (
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
