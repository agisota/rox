import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@rox/ui/context-menu";
import { Download, Eye, Link2, Pencil, Share2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

/** Callbacks the row/tile context menu invokes. Folder vs file differ slightly. */
export interface EntryMenuActions {
	kind: "file" | "folder";
	onOpen: () => void;
	onPreview?: () => void;
	onDownload?: () => void;
	onRename: () => void;
	onShare: () => void;
	onCopyLink: () => void;
	onDelete: () => void;
}

/**
 * Right-click context menu shared by list rows and grid tiles. Mirrors the web
 * DropdownMenu item set but as a native-feeling context menu (the spec's
 * "row ContextMenu vs hover-kebab duality"). Files add Предпросмотр/Скачать;
 * both kinds get Переименовать/Поделиться/Копировать ссылку/Удалить.
 */
export function EntryContextMenu({
	actions,
	children,
}: {
	actions: EntryMenuActions;
	children: ReactNode;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem onSelect={actions.onOpen}>
					{actions.kind === "folder" ? (
						<>
							<Eye className="size-4" /> Открыть
						</>
					) : (
						<>
							<Eye className="size-4" /> Предпросмотр
						</>
					)}
				</ContextMenuItem>
				{actions.kind === "file" && actions.onDownload ? (
					<ContextMenuItem onSelect={actions.onDownload}>
						<Download className="size-4" /> Скачать
					</ContextMenuItem>
				) : null}
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={actions.onRename}>
					<Pencil className="size-4" /> Переименовать
				</ContextMenuItem>
				<ContextMenuItem onSelect={actions.onShare}>
					<Share2 className="size-4" /> Поделиться
				</ContextMenuItem>
				<ContextMenuItem onSelect={actions.onCopyLink}>
					<Link2 className="size-4" /> Копировать ссылку
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem variant="destructive" onSelect={actions.onDelete}>
					<Trash2 className="size-4" /> Удалить
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
