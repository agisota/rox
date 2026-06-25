import { useDroppable } from "@dnd-kit/core";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import {
	ChevronRight,
	Folder as FolderIcon,
	HardDrive,
	Loader2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import type { DriveFolder } from "../../types";
import { ROOT_CRUMB_LABEL } from "../../utils/breadcrumbPath";
import { dropTargetId } from "../../utils/dnd";

/**
 * Left-rail folder tree for the desktop Drive.
 *
 * A collapsible tree rooted at «Диск» (the Drive root, `folderId === null`)
 * whose children load lazily through the shared `drive.listFolder` tRPC query —
 * one query per expanded node, keyed by `folderId`, so react-query caches each
 * level: re-expanding a node is instant (cache-first per AGENTS.md #9) and the
 * spinner only appears while a node genuinely has no data yet.
 *
 * The tree is a pure platform shell over the shared folder model + navigation
 * stack: the active path is highlighted from the same `activeId`/breadcrumb
 * stack that drives the main area, and clicking a node calls back into the
 * existing `navigateTo`/`openFolder` mechanism. Each node is also a dnd-kit
 * drop target (same `dropTargetId` encoding as the list/grid/breadcrumb drop
 * zones) so a drag-to-move can land on any folder in the rail — useful even
 * before the dedicated move flow lands, and never blocked by it.
 *
 * Cross-platform: the folder model and navigation contract are the shared core;
 * only this rendering + dnd-kit edge adapter is desktop-specific.
 */

export interface DriveTreePathEntry {
	id: string;
	name: string;
}

interface DriveFolderTreeProps {
	/** The current navigation stack (root → … → current folder). */
	path: DriveTreePathEntry[];
	/** The active folder id, or `null` for the Drive root. */
	activeId: string | null;
	/**
	 * Navigate into a folder. `null` targets the Drive root. Mirrors the main
	 * area's `openFolder`/`navigateTo` so the tree, breadcrumb and listing stay
	 * in sync.
	 */
	onNavigate: (folder: { id: string; name: string } | null) => void;
	/** Whether tree nodes should accept drag-to-move drops. */
	droppable: boolean;
}

export function DriveFolderTree({
	path,
	activeId,
	onNavigate,
	droppable,
}: DriveFolderTreeProps) {
	// The ids on the active path are always expanded so the current folder is
	// revealed in the tree without the user re-opening every ancestor.
	const pathIds = useMemo(() => new Set(path.map((p) => p.id)), [path]);

	return (
		<nav aria-label="Папки" className="min-h-0 overflow-y-auto pr-1">
			<ul className="space-y-0.5">
				<TreeNode
					folderId={null}
					name={ROOT_CRUMB_LABEL}
					depth={0}
					activeId={activeId}
					pathIds={pathIds}
					onNavigate={onNavigate}
					droppable={droppable}
					forceExpanded
				/>
			</ul>
		</nav>
	);
}

interface TreeNodeProps {
	folderId: string | null;
	name: string;
	depth: number;
	activeId: string | null;
	pathIds: ReadonlySet<string>;
	onNavigate: (folder: { id: string; name: string } | null) => void;
	droppable: boolean;
	/** The root node renders expanded from the start. */
	forceExpanded?: boolean;
}

function TreeNode({
	folderId,
	name,
	depth,
	activeId,
	pathIds,
	onNavigate,
	droppable,
	forceExpanded = false,
}: TreeNodeProps) {
	const trpc = useTRPC();

	const onActivePath = folderId !== null && pathIds.has(folderId);
	const [manualExpanded, setManualExpanded] = useState(false);
	const expanded = forceExpanded || manualExpanded || onActivePath;
	const isActive = folderId === activeId;

	const queryOptions = trpc.drive.listFolder.queryOptions({ folderId });
	const children = useQuery({ ...queryOptions, enabled: expanded });

	const childFolders = (children.data?.folders ??
		[]) as unknown as DriveFolder[];
	const hasData = children.data != null;
	// Show a spinner only while a node is expanded, fetching, and has no cached
	// children yet (cache-first: known levels render instantly on re-expand).
	const showSpinner = expanded && children.isLoading && !hasData;

	const target =
		folderId === null
			? ({ kind: "root" } as const)
			: ({ kind: "folder", id: folderId } as const);
	const { setNodeRef, isOver } = useDroppable({
		id: `tree:${dropTargetId(target)}`,
		data: { target },
		disabled: !droppable,
	});

	const toggle = useCallback(() => setManualExpanded((prev) => !prev), []);

	const onActivate = useCallback(() => {
		if (folderId === null) onNavigate(null);
		else onNavigate({ id: folderId, name });
		setManualExpanded(true);
	}, [folderId, name, onNavigate]);

	return (
		<li>
			<div
				ref={setNodeRef}
				className={cn(
					"group flex items-center gap-1 rounded-md transition-colors",
					isActive
						? "bg-primary/15 text-foreground ring-1 ring-primary/40"
						: "hover:bg-muted/50",
					isOver && droppable && "bg-primary/20 ring-1 ring-primary/60",
				)}
				style={{ paddingLeft: `${depth * 12 + 4}px` }}
			>
				<button
					type="button"
					aria-label={expanded ? "Свернуть" : "Развернуть"}
					onClick={(event) => {
						event.stopPropagation();
						toggle();
					}}
					className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform hover:text-foreground"
				>
					<ChevronRight
						className={cn(
							"size-3.5 transition-transform",
							expanded && "rotate-90",
						)}
					/>
				</button>
				<button
					type="button"
					onClick={onActivate}
					className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-sm"
				>
					{folderId === null ? (
						<HardDrive className="size-4 shrink-0 text-primary" />
					) : (
						<FolderIcon className="size-4 shrink-0 text-primary/80" />
					)}
					<span className="truncate font-[family-name:var(--font-victor-mono,inherit)]">
						{name}
					</span>
				</button>
			</div>

			{expanded ? (
				<ul className="space-y-0.5">
					{showSpinner ? (
						<li
							className="flex items-center gap-1.5 py-1 text-muted-foreground text-xs"
							style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
						>
							<Loader2 className="size-3 animate-spin" />
							Загрузка…
						</li>
					) : hasData && childFolders.length === 0 ? (
						<li
							className="py-1 text-muted-foreground/70 text-xs"
							style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
						>
							Нет вложенных папок
						</li>
					) : (
						childFolders.map((child) => (
							<TreeNode
								key={child.id}
								folderId={child.id}
								name={child.name}
								depth={depth + 1}
								activeId={activeId}
								pathIds={pathIds}
								onNavigate={onNavigate}
								droppable={droppable}
							/>
						))
					)}
				</ul>
			) : null}
		</li>
	);
}
