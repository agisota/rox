import { useDroppable } from "@dnd-kit/core";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { useState } from "react";
import {
	LuClock,
	LuFlame,
	LuFolder,
	LuFolderPlus,
	LuLibrary,
	LuStar,
	LuTag,
	LuX,
} from "react-icons/lu";
import type { RailFilter } from "../../lib/types";

interface RailRowProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	count?: number;
	active: boolean;
	onSelect: () => void;
	/** dnd-kit droppable id — set on folder rows so cards can be dropped in. */
	droppableId?: string;
}

function RailRow({
	icon: Icon,
	label,
	count,
	active,
	onSelect,
	droppableId,
}: RailRowProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: droppableId ?? `__rail_static_${label}`,
		disabled: droppableId === undefined,
	});

	return (
		<button
			ref={droppableId ? setNodeRef : undefined}
			type="button"
			onClick={onSelect}
			aria-current={active ? "true" : undefined}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
				active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				droppableId !== undefined &&
					isOver &&
					"ring-2 ring-primary ring-inset bg-accent/70",
			)}
		>
			<Icon className="size-4 shrink-0" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{count !== undefined && (
				<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
					{count}
				</span>
			)}
		</button>
	);
}

/** Droppable target for clearing a prompt's folder (back to «Без папки»). */
function UnfiledRow({
	count,
	active,
	onSelect,
}: {
	count: number;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<RailRow
			icon={LuFolder}
			label="Без папки"
			count={count}
			active={active}
			onSelect={onSelect}
			droppableId="folder::__unfiled__"
		/>
	);
}

export interface LeftRailProps {
	filter: RailFilter;
	onFilterChange: (filter: RailFilter) => void;
	totalCount: number;
	favoriteCount: number;
	recentCount: number;
	frequentCount: number;
	unfiledCount: number;
	tags: { tag: string; count: number }[];
	folders: { folder: string; count: number }[];
	onCreateFolder: (folder: string) => void;
}

/**
 * Collection tree: Все / Избранное / Недавние / Часто используемые, then real
 * folders (drop targets for drag-to-file), then per-tag rows.
 */
export function LeftRail({
	filter,
	onFilterChange,
	totalCount,
	favoriteCount,
	recentCount,
	frequentCount,
	unfiledCount,
	tags,
	folders,
	onCreateFolder,
}: LeftRailProps) {
	const isTag = (tag: string) => filter.kind === "tag" && filter.tag === tag;
	const isFolder = (folder: string) =>
		filter.kind === "folder" && filter.folder === folder;

	const [addingFolder, setAddingFolder] = useState(false);
	const [folderName, setFolderName] = useState("");

	const commitFolder = () => {
		const name = folderName.trim();
		if (name.length > 0) onCreateFolder(name);
		setFolderName("");
		setAddingFolder(false);
	};

	return (
		<aside className="flex w-[220px] shrink-0 flex-col border-r border-border">
			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-0.5 p-2">
					<RailRow
						icon={LuLibrary}
						label="Все"
						count={totalCount}
						active={filter.kind === "all"}
						onSelect={() => onFilterChange({ kind: "all" })}
					/>
					<RailRow
						icon={LuStar}
						label="Избранное"
						count={favoriteCount}
						active={filter.kind === "favorites"}
						onSelect={() => onFilterChange({ kind: "favorites" })}
					/>
					<RailRow
						icon={LuClock}
						label="Недавние"
						count={recentCount}
						active={filter.kind === "recent"}
						onSelect={() => onFilterChange({ kind: "recent" })}
					/>
					<RailRow
						icon={LuFlame}
						label="Часто используемые"
						count={frequentCount}
						active={filter.kind === "frequent"}
						onSelect={() => onFilterChange({ kind: "frequent" })}
					/>

					<div className="mt-3 flex items-center justify-between gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<LuFolder className="size-3" />
							Папки
						</span>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Новая папка"
							className="size-5"
							onClick={() => setAddingFolder(true)}
						>
							<LuFolderPlus className="size-3.5" />
						</Button>
					</div>

					{addingFolder && (
						<div className="flex items-center gap-1 px-1 pb-1">
							<Input
								autoFocus
								placeholder="Название папки"
								value={folderName}
								onChange={(event) => setFolderName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitFolder();
									} else if (event.key === "Escape") {
										setFolderName("");
										setAddingFolder(false);
									}
								}}
								className="h-7 text-sm"
							/>
							<Button
								size="icon"
								variant="ghost"
								aria-label="Отмена"
								className="size-7 shrink-0"
								onClick={() => {
									setFolderName("");
									setAddingFolder(false);
								}}
							>
								<LuX className="size-3.5" />
							</Button>
						</div>
					)}

					<UnfiledRow
						count={unfiledCount}
						active={filter.kind === "folder" && filter.folder === ""}
						onSelect={() => onFilterChange({ kind: "folder", folder: "" })}
					/>
					{folders.map(({ folder, count }) => (
						<RailRow
							key={folder}
							icon={LuFolder}
							label={folder}
							count={count}
							active={isFolder(folder)}
							onSelect={() => onFilterChange({ kind: "folder", folder })}
							droppableId={`folder::${folder}`}
						/>
					))}

					{tags.length > 0 && (
						<>
							<div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground">
								<LuTag className="size-3" />
								Теги
							</div>
							{tags.map(({ tag, count }) => (
								<RailRow
									key={tag}
									icon={LuTag}
									label={tag}
									count={count}
									active={isTag(tag)}
									onSelect={() => onFilterChange({ kind: "tag", tag })}
								/>
							))}
						</>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}

/** Stable droppable id → folder value (or null) decoder for the DnD handler. */
export function folderFromDroppableId(id: string): string | null | undefined {
	if (!id.startsWith("folder::")) return undefined;
	const value = id.slice("folder::".length);
	if (value === "__unfiled__") return null;
	return value;
}
