import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { cn } from "@rox/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	ArrowDown,
	ArrowUp,
	Download,
	Folder,
	Link2,
	MoreHorizontal,
	Pencil,
	Share2,
	Trash2,
} from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
} from "react";
import { formatFileSize } from "../../utils/formatFileSize";
import {
	type EntryRef,
	refKey,
	type SortField,
	type SortState,
} from "../types";
import { dragId, dropTargetId } from "../utils/dnd";
import { fileIcon } from "../utils/fileKind";
import type { DriveBrowserModel } from "./browserModel";
import { EntryContextMenu } from "./EntryContextMenu";
import { InlineRename } from "./InlineRename";

const ROW_HEIGHT = 40;

/** One windowed entry: a folder then files, flattened for the virtualizer. */
type Row = { type: "folder"; index: number } | { type: "file"; index: number };

function formatDate(value: string | Date): string {
	const d = value instanceof Date ? value : new Date(value);
	return d.toLocaleDateString("ru-RU", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function SortHeader({
	label,
	field,
	sort,
	onSort,
	className,
}: {
	label: string;
	field: SortField;
	sort: SortState;
	onSort: (field: SortField) => void;
	className?: string;
}) {
	const active = sort.field === field;
	return (
		<button
			type="button"
			onClick={() => onSort(field)}
			className={cn(
				"flex items-center gap-1 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide transition-colors hover:text-foreground",
				active && "text-foreground",
				className,
			)}
		>
			{label}
			{active ? (
				sort.dir === "asc" ? (
					<ArrowUp className="size-3" />
				) : (
					<ArrowDown className="size-3" />
				)
			) : null}
		</button>
	);
}

interface DriveListViewProps extends DriveBrowserModel {
	sort: SortState;
	onSort: (field: SortField) => void;
}

/**
 * List mode — a virtualized table over the merged folders + files. Folders
 * render first (drill-in on open), then files. Virtualized with
 * `@tanstack/react-virtual` so 1000+ entries stay at 60fps (the old stub mapped
 * every row). Selection ring, inline rename, right-click context menu and a
 * hover kebab mirror the grid view through the shared {@link DriveBrowserModel}.
 */
export function DriveListView(props: DriveListViewProps) {
	const { folders, files, selected, renaming, sort, onSort } = props;
	const parentRef = useRef<HTMLDivElement>(null);

	const rows = useMemo<Row[]>(
		() => [
			...folders.map((_, index) => ({ type: "folder" as const, index })),
			...files.map((_, index) => ({ type: "file" as const, index })),
		],
		[folders, files],
	);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 12,
	});

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Sticky header */}
			<div className="grid grid-cols-[1fr_7rem_9rem_2.5rem] items-center gap-3 border-border/60 border-b px-3 py-2">
				<SortHeader label="Имя" field="name" sort={sort} onSort={onSort} />
				<SortHeader
					label="Размер"
					field="size"
					sort={sort}
					onSort={onSort}
					className="justify-end"
				/>
				<SortHeader label="Изменён" field="date" sort={sort} onSort={onSort} />
				<span />
			</div>

			<div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
				<div
					style={{ height: virtualizer.getTotalSize(), position: "relative" }}
				>
					{virtualizer.getVirtualItems().map((virtualRow) => {
						const row = rows[virtualRow.index];
						if (!row) return null;
						const style = {
							position: "absolute" as const,
							top: 0,
							left: 0,
							width: "100%",
							height: ROW_HEIGHT,
							transform: `translateY(${virtualRow.start}px)`,
						};
						return (
							<div key={virtualRow.key} style={style}>
								{row.type === "folder" ? (
									<FolderRow
										folder={folders[row.index]}
										model={props}
										selected={selected.has(
											refKey({ kind: "folder", id: folders[row.index].id }),
										)}
										renaming={
											renaming?.kind === "folder" &&
											renaming.id === folders[row.index].id
										}
									/>
								) : (
									<FileRow
										file={files[row.index]}
										model={props}
										selected={selected.has(
											refKey({ kind: "file", id: files[row.index].id }),
										)}
										renaming={
											renaming?.kind === "file" &&
											renaming.id === files[row.index].id
										}
									/>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

interface RowDnd {
	setNodeRef?: (node: HTMLElement | null) => void;
	style?: CSSProperties;
	listeners?: Record<string, unknown>;
	attributes?: Record<string, unknown>;
	isDragging?: boolean;
	isOver?: boolean;
}

function RowShell({
	selected,
	onClick,
	onDoubleClick,
	children,
	dnd,
}: {
	selected: boolean;
	onClick: (event: { metaKey: boolean; shiftKey: boolean }) => void;
	onDoubleClick: () => void;
	children: ReactNode;
	dnd?: RowDnd;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: file row holds a nested kebab button; cannot be a <button>. role="row" + keyboard below.
		<div
			ref={dnd?.setNodeRef}
			style={dnd?.style}
			className={cn(
				"group grid h-10 grid-cols-[1fr_7rem_9rem_2.5rem] items-center gap-3 rounded-md px-3 text-sm transition-colors",
				selected
					? "bg-primary/10 ring-1 ring-primary/50"
					: "hover:bg-accent/40",
				dnd?.isDragging && "opacity-40",
				dnd?.isOver && "bg-primary/15 ring-1 ring-primary/50",
			)}
			onClick={(event) =>
				onClick({
					metaKey: event.metaKey || event.ctrlKey,
					shiftKey: event.shiftKey,
				})
			}
			onDoubleClick={onDoubleClick}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onDoubleClick();
				}
			}}
			{...dnd?.attributes}
			{...dnd?.listeners}
		>
			{children}
		</div>
	);
}

/** Wire an entry row as a dnd-kit draggable; folders are additionally droppable. */
function useRowDnd(
	model: DriveBrowserModel,
	ref: EntryRef,
	droppable: boolean,
): RowDnd {
	const draggable = useDraggable({
		id: dragId(ref),
		data: model.dragDataFor(ref),
	});
	const droppableState = useDroppable({
		id: dropTargetId({ kind: "folder", id: ref.id }),
		data: { target: { kind: "folder", id: ref.id } },
		disabled: !droppable || !model.isMoving,
	});
	const setNodeRef = useCallback(
		(node: HTMLElement | null) => {
			draggable.setNodeRef(node);
			if (droppable) droppableState.setNodeRef(node);
		},
		[draggable, droppableState, droppable],
	);
	return {
		setNodeRef,
		listeners: draggable.listeners as Record<string, unknown> | undefined,
		attributes: draggable.attributes as unknown as Record<string, unknown>,
		isDragging: draggable.isDragging,
		isOver: droppable ? droppableState.isOver : false,
	};
}

function FolderRow({
	folder,
	model,
	selected,
	renaming,
}: {
	folder: DriveBrowserModel["folders"][number];
	model: DriveBrowserModel;
	selected: boolean;
	renaming: boolean;
}) {
	const ref: EntryRef = { kind: "folder", id: folder.id };
	const dnd = useRowDnd(model, ref, true);
	return (
		<EntryContextMenu
			actions={{
				kind: "folder",
				onOpen: () => model.onOpenFolder(folder),
				onRename: () => model.onStartRename(ref),
				onShare: () => model.onShareFolder(folder),
				onCopyLink: () => model.onCopyLinkFolder(folder),
				onDelete: () => model.onDeleteFolder(folder),
			}}
		>
			<RowShell
				selected={selected}
				onClick={(mods) => model.onSelect(ref, mods)}
				onDoubleClick={() => model.onOpenFolder(folder)}
				dnd={dnd}
			>
				<div className="flex min-w-0 items-center gap-2">
					<Folder className="size-4 shrink-0 text-primary" />
					{renaming ? (
						<InlineRename
							initial={folder.name}
							onCommit={(name) => model.onCommitRename(ref, name)}
							onCancel={model.onCancelRename}
						/>
					) : (
						<span className="truncate font-medium">{folder.name}</span>
					)}
				</div>
				<span className="text-right text-muted-foreground">—</span>
				<span className="text-muted-foreground text-xs">
					{formatDate(folder.createdAt)}
				</span>
				<FolderKebab folder={folder} model={model} />
			</RowShell>
		</EntryContextMenu>
	);
}

function FileRow({
	file,
	model,
	selected,
	renaming,
}: {
	file: DriveBrowserModel["files"][number];
	model: DriveBrowserModel;
	selected: boolean;
	renaming: boolean;
}) {
	const ref: EntryRef = { kind: "file", id: file.id };
	const dnd = useRowDnd(model, ref, false);
	const Icon = fileIcon(file.mediaType, file.name);
	return (
		<EntryContextMenu
			actions={{
				kind: "file",
				onOpen: () => model.onOpenFile(file),
				onPreview: () => model.onOpenFile(file),
				onDownload: () => model.onDownload(file.id),
				onRename: () => model.onStartRename(ref),
				onShare: () => model.onShareFile(file),
				onCopyLink: () => model.onCopyLinkFile(file),
				onDelete: () => model.onDeleteFile(file),
			}}
		>
			<RowShell
				selected={selected}
				onClick={(mods) => model.onSelect(ref, mods)}
				onDoubleClick={() => model.onOpenFile(file)}
				dnd={dnd}
			>
				<div className="flex min-w-0 items-center gap-2">
					<Icon className="size-4 shrink-0 text-muted-foreground" />
					{renaming ? (
						<InlineRename
							initial={file.name}
							onCommit={(name) => model.onCommitRename(ref, name)}
							onCancel={model.onCancelRename}
						/>
					) : (
						<span className="truncate">{file.name}</span>
					)}
				</div>
				<span className="text-right text-muted-foreground text-xs tabular-nums">
					{formatFileSize(file.sizeBytes)}
				</span>
				<span className="text-muted-foreground text-xs">
					{formatDate(file.createdAt)}
				</span>
				<FileKebab file={file} model={model} />
			</RowShell>
		</EntryContextMenu>
	);
}

function FolderKebab({
	folder,
	model,
}: {
	folder: DriveBrowserModel["folders"][number];
	model: DriveBrowserModel;
}) {
	const ref: EntryRef = { kind: "folder", id: folder.id };
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
					aria-label={`Действия с папкой ${folder.name}`}
					onClick={(event) => event.stopPropagation()}
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
				<DropdownMenuItem onSelect={() => model.onStartRename(ref)}>
					<Pencil className="size-4" /> Переименовать
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => model.onShareFolder(folder)}>
					<Share2 className="size-4" /> Поделиться
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => model.onCopyLinkFolder(folder)}>
					<Link2 className="size-4" /> Копировать ссылку
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onSelect={() => model.onDeleteFolder(folder)}
				>
					<Trash2 className="size-4" /> Удалить
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function FileKebab({
	file,
	model,
}: {
	file: DriveBrowserModel["files"][number];
	model: DriveBrowserModel;
}) {
	const ref: EntryRef = { kind: "file", id: file.id };
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
					aria-label={`Действия с файлом ${file.name}`}
					onClick={(event) => event.stopPropagation()}
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
				<DropdownMenuItem onSelect={() => model.onDownload(file.id)}>
					<Download className="size-4" /> Скачать
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => model.onStartRename(ref)}>
					<Pencil className="size-4" /> Переименовать
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => model.onShareFile(file)}>
					<Share2 className="size-4" /> Поделиться
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => model.onCopyLinkFile(file)}>
					<Link2 className="size-4" /> Копировать ссылку
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onSelect={() => model.onDeleteFile(file)}
				>
					<Trash2 className="size-4" /> Удалить
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
