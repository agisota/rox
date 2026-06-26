import { Button } from "@rox/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@rox/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { MessageSquare, MoreHorizontal, Play, Trash2 } from "lucide-react";
import type { WorkspaceGovernanceItemRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

interface GovernanceItemRowProps {
	item: WorkspaceGovernanceItemRow;
	/** Primary action: spawn a new chat-branch executing this item. */
	onPlay: (item: WorkspaceGovernanceItemRow) => void;
	/** Secondary action: open a chat to discuss (no branching). */
	onDiscuss: (item: WorkspaceGovernanceItemRow) => void;
	onRemove: (item: WorkspaceGovernanceItemRow) => void;
}

/**
 * A single goal/task/mission row. Hover reveals a glass ▶ Play (spawns a new
 * chat-branch) and a ⋯ menu. Right-clicking the row opens the same secondary
 * menu (Обсудить с AI / Удалить).
 */
export function GovernanceItemRow({
	item,
	onPlay,
	onDiscuss,
	onRemove,
}: GovernanceItemRowProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"group/gov-row relative flex items-center gap-1.5 rounded-md px-2 py-1",
						"font-mono text-xs text-foreground/90",
						"transition-colors hover:bg-card/50",
					)}
				>
					<span className="min-w-0 flex-1 truncate" title={item.text}>
						{item.text}
					</span>
					<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/gov-row:opacity-100 focus-within:opacity-100">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className={cn(
										"size-6 rounded-md text-primary/80",
										"hover:bg-primary/15 hover:text-primary",
									)}
									onClick={() => onPlay(item)}
									aria-label="Запустить в новой ветке"
								>
									<Play className="size-3.5 fill-current" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left">
								Запустить в новой ветке
							</TooltipContent>
						</Tooltip>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6 rounded-md text-muted-foreground hover:text-foreground"
									aria-label="Действия"
								>
									<MoreHorizontal className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-44">
								<DropdownMenuItem onSelect={() => onDiscuss(item)}>
									<MessageSquare className="size-3.5" />
									Обсудить с AI
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => onRemove(item)}
								>
									<Trash2 className="size-3.5" />
									Удалить
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="min-w-44">
				<ContextMenuItem onSelect={() => onPlay(item)}>
					<Play className="size-3.5 fill-current" />
					Запустить в новой ветке
				</ContextMenuItem>
				<ContextMenuItem onSelect={() => onDiscuss(item)}>
					<MessageSquare className="size-3.5" />
					Обсудить с AI
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem variant="destructive" onSelect={() => onRemove(item)}>
					<Trash2 className="size-3.5" />
					Удалить
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
