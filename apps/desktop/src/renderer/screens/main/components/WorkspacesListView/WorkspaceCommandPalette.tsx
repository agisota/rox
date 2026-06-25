import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@rox/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { cn } from "@rox/ui/utils";
import { useMemo, useState } from "react";
import { LuFolder, LuFolderGit2, LuPlus } from "react-icons/lu";
import { buildWorkspaceFuse, fuzzyFilter } from "./listModel";
import type { WorkspaceItem } from "./types";
import { getRelativeTime } from "./utils";

/** How many most-recent items seed the "Недавние" group on an empty query. */
const RECENT_COUNT = 5;

interface WorkspaceCommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: WorkspaceItem[];
	/** Switch to / reopen the chosen workspace (open → switch, closed → reopen). */
	onSelectWorkspace: (item: WorkspaceItem) => void;
	/** "+ Новое рабочее пространство" action. */
	onCreate: () => void;
}

/**
 * cmd/ctrl+K command palette over every workspace. Ranking is delegated to the
 * shared {@link buildWorkspaceFuse} fuse index (name/project/branch) so the
 * palette and the list filter agree; cmdk's own substring filter is disabled
 * (`shouldFilter={false}`) and we feed it the already-ranked stream.
 *
 * Empty query shows a "Недавние" group (latest by `lastOpenedAt`); a non-empty
 * query shows fuzzy hits grouped by project. Enter fires `onSelectWorkspace`.
 */
export function WorkspaceCommandPalette({
	open,
	onOpenChange,
	items,
	onSelectWorkspace,
	onCreate,
}: WorkspaceCommandPaletteProps) {
	const [query, setQuery] = useState("");

	const fuse = useMemo(() => buildWorkspaceFuse(items), [items]);

	const recent = useMemo(
		() =>
			[...items]
				.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
				.slice(0, RECENT_COUNT),
		[items],
	);

	const results = useMemo(
		() => fuzzyFilter(fuse, items, query),
		[fuse, items, query],
	);

	// Group fuzzy hits by project, preserving fuse rank order within each group.
	const grouped = useMemo(() => {
		const map = new Map<
			string,
			{ projectName: string; items: WorkspaceItem[] }
		>();
		for (const item of results) {
			const existing = map.get(item.projectId);
			if (existing) {
				existing.items.push(item);
			} else {
				map.set(item.projectId, {
					projectName: item.projectName,
					items: [item],
				});
			}
		}
		return [...map.values()];
	}, [results]);

	const handleSelect = (item: WorkspaceItem) => {
		onOpenChange(false);
		setQuery("");
		onSelectWorkspace(item);
	};

	const handleCreate = () => {
		onOpenChange(false);
		setQuery("");
		onCreate();
	};

	const hasQuery = query.trim().length > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setQuery("");
				onOpenChange(next);
			}}
		>
			<DialogHeader className="sr-only">
				<DialogTitle>Командная палитра рабочих пространств</DialogTitle>
				<DialogDescription>
					Переключение между рабочими пространствами по имени, проекту или ветке
				</DialogDescription>
			</DialogHeader>
			<DialogContent
				className="glass-panel overflow-hidden border-border/60 p-0"
				showCloseButton={false}
			>
				<Command
					shouldFilter={false}
					className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
				>
					<CommandInput
						placeholder="Перейти к рабочему пространству…"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList>
						<CommandEmpty>Ничего не найдено</CommandEmpty>

						<CommandGroup heading="Действия">
							<CommandItem
								value="__create__"
								onSelect={handleCreate}
								className="gap-2"
							>
								<LuPlus className="size-4" />
								Новое рабочее пространство
							</CommandItem>
						</CommandGroup>

						{!hasQuery && recent.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup heading="Недавние">
									{recent.map((item) => (
										<WorkspaceCommandItem
											key={item.uniqueId}
											item={item}
											onSelect={handleSelect}
										/>
									))}
								</CommandGroup>
							</>
						)}

						{hasQuery &&
							grouped.map((group) => (
								<CommandGroup
									key={group.projectName}
									heading={group.projectName}
								>
									{group.items.map((item) => (
										<WorkspaceCommandItem
											key={item.uniqueId}
											item={item}
											onSelect={handleSelect}
										/>
									))}
								</CommandGroup>
							))}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}

function WorkspaceCommandItem({
	item,
	onSelect,
}: {
	item: WorkspaceItem;
	onSelect: (item: WorkspaceItem) => void;
}) {
	const isBranch = item.type === "branch";
	return (
		<CommandItem
			value={item.uniqueId}
			keywords={[item.name, item.projectName, item.branch]}
			onSelect={() => onSelect(item)}
			className="gap-2"
		>
			{isBranch ? (
				<LuFolder className="size-4 text-muted-foreground" />
			) : (
				<LuFolderGit2 className="size-4 text-muted-foreground" />
			)}
			<span className={cn("truncate", !item.isOpen && "text-foreground/60")}>
				{item.name}
			</span>
			<span className="ml-auto shrink-0 text-foreground/40 text-xs">
				{item.isOpen
					? "Активно"
					: getRelativeTime(item.createdAt, { format: "compact" })}
			</span>
		</CommandItem>
	);
}
