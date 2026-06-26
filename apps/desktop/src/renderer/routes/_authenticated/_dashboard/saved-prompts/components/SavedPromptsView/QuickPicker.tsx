import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { useMemo } from "react";
import { LuStar, LuVariable } from "react-icons/lu";
import type { PromptEntry } from "../../lib/types";

export interface QuickPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	prompts: PromptEntry[];
	onPick: (prompt: PromptEntry) => void;
}

/**
 * Global Cmd/Ctrl+K quick-picker (cmdk). Generalizes today's Quick-Chat-only
 * handoff: fuzzy-find a prompt and pick it without leaving the keyboard. Picking
 * routes through the same insert pipeline as the cards (variable fill when the
 * body has `{{tokens}}`, otherwise a direct insert). cmdk does its own fuzzy
 * ranking over the rendered item text, so we feed it title + tags.
 */
export function QuickPicker({
	open,
	onOpenChange,
	prompts,
	onPick,
}: QuickPickerProps) {
	// Favorites first, then most-recently-used, so the top of the list is the
	// user's likeliest pick before they type.
	const ordered = useMemo(() => {
		return [...prompts].sort((a, b) => {
			if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
			return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
		});
	}, [prompts]);

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Вставить промпт"
			description="Поиск по сохранённым промптам"
		>
			<CommandInput placeholder="Поиск промпта…" />
			<CommandList>
				<CommandEmpty>Ничего не найдено.</CommandEmpty>
				<CommandGroup heading="Сохранённые промпты">
					{ordered.map((prompt) => (
						<CommandItem
							key={prompt.id}
							value={`${prompt.title} ${prompt.tags.join(" ")}`}
							onSelect={() => {
								onPick(prompt);
								onOpenChange(false);
							}}
							className="flex items-center gap-2"
						>
							{prompt.favorite && (
								<LuStar className="size-3.5 shrink-0 fill-primary text-primary" />
							)}
							<span className="min-w-0 flex-1 truncate font-mono">
								{prompt.title}
							</span>
							{prompt.variableNames.length > 0 && (
								<span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
									<LuVariable className="size-3" />
									{prompt.variableNames.length}
								</span>
							)}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
