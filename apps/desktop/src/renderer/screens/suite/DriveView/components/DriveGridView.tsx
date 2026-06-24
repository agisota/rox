import { AspectRatio } from "@rox/ui/aspect-ratio";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { MotionList, MotionListItem, MotionPressable } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import {
	Download,
	Folder,
	Link2,
	MoreHorizontal,
	Pencil,
	Share2,
	Trash2,
} from "lucide-react";
import { formatFileSize } from "../../utils/formatFileSize";
import { type EntryRef, refKey } from "../types";
import { fileIcon } from "../utils/fileKind";
import type { DriveBrowserModel } from "./browserModel";
import { EntryContextMenu } from "./EntryContextMenu";
import { InlineRename } from "./InlineRename";

/**
 * Grid mode — responsive tiles (`auto-fill minmax(168px,1fr)`). Folder tiles
 * get a faint stacked-paper back edge + folder glyph; file tiles get a glass
 * thumbnail area with a type-derived icon (image/video poster generation is
 * P1). Shares the {@link DriveBrowserModel} so selection, inline rename, the
 * context menu and the hover kebab behave identically to the list view.
 */
export function DriveGridView(model: DriveBrowserModel) {
	const { folders, files, selected, renaming } = model;

	return (
		<div className="min-h-0 flex-1 overflow-auto p-3">
			<MotionList className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
				{folders.map((folder) => (
					<MotionListItem key={`folder:${folder.id}`}>
						<FolderTile
							folder={folder}
							model={model}
							selected={selected.has(refKey({ kind: "folder", id: folder.id }))}
							renaming={
								renaming?.kind === "folder" && renaming.id === folder.id
							}
						/>
					</MotionListItem>
				))}
				{files.map((file) => (
					<MotionListItem key={`file:${file.id}`}>
						<FileTile
							file={file}
							model={model}
							selected={selected.has(refKey({ kind: "file", id: file.id }))}
							renaming={renaming?.kind === "file" && renaming.id === file.id}
						/>
					</MotionListItem>
				))}
			</MotionList>
		</div>
	);
}

function TileShell({
	selected,
	onClick,
	onDoubleClick,
	children,
}: {
	selected: boolean;
	onClick: (mods: { metaKey: boolean; shiftKey: boolean }) => void;
	onDoubleClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<MotionPressable>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: file tile holds a nested kebab button; cannot be a <button>. Keyboard handled below. */}
			<div
				className={cn(
					"group relative flex flex-col gap-2 rounded-xl border p-2.5 transition-colors",
					selected
						? "border-primary/50 bg-primary/10 ring-1 ring-primary/50"
						: "border-border/60 hover:bg-accent/30",
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
			>
				{children}
			</div>
		</MotionPressable>
	);
}

function FolderTile({
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
			<TileShell
				selected={selected}
				onClick={(mods) => model.onSelect(ref, mods)}
				onDoubleClick={() => model.onOpenFolder(folder)}
			>
				<AspectRatio
					ratio={4 / 3}
					className="relative flex items-center justify-center rounded-lg bg-muted/30"
				>
					{/* Faint stacked-paper back edge */}
					<span className="absolute top-2 right-3 left-3 h-2 rounded-t-sm bg-border/50" />
					<Folder className="relative size-9 text-primary" />
				</AspectRatio>
				<TileLabel
					name={folder.name}
					sub="Папка"
					renaming={renaming}
					onCommit={(name) => model.onCommitRename(ref, name)}
					onCancel={model.onCancelRename}
					kebab={<FolderTileKebab folder={folder} model={model} />}
				/>
			</TileShell>
		</EntryContextMenu>
	);
}

function FileTile({
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
			<TileShell
				selected={selected}
				onClick={(mods) => model.onSelect(ref, mods)}
				onDoubleClick={() => model.onOpenFile(file)}
			>
				<AspectRatio
					ratio={4 / 3}
					className="flex items-center justify-center rounded-lg bg-muted/30"
				>
					<Icon className="size-9 text-muted-foreground" />
				</AspectRatio>
				<TileLabel
					name={file.name}
					sub={formatFileSize(file.sizeBytes)}
					renaming={renaming}
					onCommit={(name) => model.onCommitRename(ref, name)}
					onCancel={model.onCancelRename}
					kebab={<FileTileKebab file={file} model={model} />}
				/>
			</TileShell>
		</EntryContextMenu>
	);
}

function TileLabel({
	name,
	sub,
	renaming,
	onCommit,
	onCancel,
	kebab,
}: {
	name: string;
	sub: string;
	renaming: boolean;
	onCommit: (name: string) => void;
	onCancel: () => void;
	kebab: React.ReactNode;
}) {
	return (
		<div className="flex min-w-0 items-start gap-1">
			<div className="min-w-0 flex-1">
				{renaming ? (
					<InlineRename
						initial={name}
						onCommit={onCommit}
						onCancel={onCancel}
					/>
				) : (
					<p className="truncate font-medium text-xs" title={name}>
						{name}
					</p>
				)}
				<p className="truncate text-[11px] text-muted-foreground tabular-nums">
					{sub}
				</p>
			</div>
			{kebab}
		</div>
	);
}

function FolderTileKebab({
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
					className="-mr-1 size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
					aria-label={`Действия с папкой ${folder.name}`}
					onClick={(event) => event.stopPropagation()}
				>
					<MoreHorizontal className="size-3.5" />
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

function FileTileKebab({
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
					className="-mr-1 size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
					aria-label={`Действия с файлом ${file.name}`}
					onClick={(event) => event.stopPropagation()}
				>
					<MoreHorizontal className="size-3.5" />
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
