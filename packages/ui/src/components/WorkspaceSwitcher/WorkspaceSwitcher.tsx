"use client";

import { Check as CheckIcon, FolderOpen, Plus, Settings2 } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "../ui/command";
import type { WorkspaceOption } from "./filter";

export type { WorkspaceOption } from "./filter";

export interface WorkspaceSwitcherFooterAction {
	id: string;
	label: string;
	icon?: React.ReactNode;
	onSelect: () => void;
}

export interface WorkspaceSwitcherProps {
	options: readonly WorkspaceOption[];
	activeId?: string | null;
	onSelect: (id: string) => void;
	/** Footer actions: New worktree / Choose path / Manage. */
	footerActions?: readonly WorkspaceSwitcherFooterAction[];
	placeholder?: string;
	emptyLabel?: string;
	className?: string;
}

/**
 * F26 — searchable workspace switcher.
 *
 * cmdk-backed command list over the (serializable) organizations collection.
 * Filters by name OR path, renders two-line options with an active highlight,
 * and exposes footer actions. Shared by desktop, web, and (via the serializable
 * `WorkspaceOption` contract + `filter.ts`) the mobile RN sheet.
 */
export function WorkspaceSwitcher({
	options,
	activeId,
	onSelect,
	footerActions,
	placeholder = "Поиск по имени или пути…",
	emptyLabel = "Воркспейсы не найдены",
	className,
}: WorkspaceSwitcherProps) {
	return (
		<Command
			// We match against name + path via each item's keywords, so cmdk's
			// default value scoring already covers the name-OR-path requirement.
			className={cn("w-full", className)}
		>
			<CommandInput placeholder={placeholder} />
			<CommandList>
				<CommandEmpty>{emptyLabel}</CommandEmpty>
				<CommandGroup>
					{options.map((option) => {
						const isActive = option.id === activeId;
						return (
							<CommandItem
								key={option.id}
								value={option.id}
								keywords={[option.name, option.path]}
								onSelect={() => onSelect(option.id)}
								className={cn("items-center gap-2", isActive && "bg-accent/40")}
							>
								<Avatar className="size-6 shrink-0 rounded-md">
									<AvatarImage
										src={option.logo ?? undefined}
										alt={option.name}
									/>
									<AvatarFallback className="rounded-md text-[10px]">
										{option.name.charAt(0).toUpperCase() || "?"}
									</AvatarFallback>
								</Avatar>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-sm font-medium">
										{option.name}
									</span>
									<span className="truncate text-xs text-muted-foreground">
										{option.path}
									</span>
								</div>
								{isActive && (
									<CheckIcon className="size-4 shrink-0 text-primary" />
								)}
							</CommandItem>
						);
					})}
				</CommandGroup>
				{footerActions && footerActions.length > 0 && (
					<>
						<CommandSeparator />
						<CommandGroup>
							{footerActions.map((action) => (
								<CommandItem
									key={action.id}
									value={`__footer__${action.id}`}
									onSelect={() => action.onSelect()}
									className="gap-2"
								>
									{action.icon}
									<span>{action.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</>
				)}
			</CommandList>
		</Command>
	);
}

/** Default footer icons so callers can build the standard action set. */
export const WorkspaceSwitcherIcons = {
	newWorktree: <Plus className="size-4" />,
	choosePath: <FolderOpen className="size-4" />,
	manage: <Settings2 className="size-4" />,
} as const;
