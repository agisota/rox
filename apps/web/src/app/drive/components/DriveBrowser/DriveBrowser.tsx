"use client";

import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Skeleton } from "@rox/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import { useQuery } from "@tanstack/react-query";
import {
	Download,
	File as FileIcon,
	Folder,
	FolderPlus,
	MoreHorizontal,
	Pencil,
	Share2,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { type FolderCrumb, truncateStackTo } from "../../utils/breadcrumbPath";
import { formatBytes } from "../../utils/formatBytes";
import { Breadcrumbs } from "../Breadcrumbs";
import { ShareDialog, type ShareTarget } from "../ShareDialog";
import { UploadDropzone } from "../UploadDropzone";
import { useDriveActions } from "./useDriveActions";

/**
 * The Drive file/folder browser. Cache-first (AGENTS.md #9): renders the last
 * known listing immediately; the skeleton + empty states only apply when there
 * is genuinely no data yet. Navigation is tracked as a folder stack so the
 * breadcrumb can rebuild the ancestor chain the API listing does not return.
 */
export function DriveBrowser() {
	const trpc = useTRPC();
	const [stack, setStack] = useState<FolderCrumb[]>([]);
	const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

	const folderId = stack.at(-1)?.id ?? null;
	const listing = useQuery(trpc.drive.listFolder.queryOptions({ folderId }));
	const actions = useDriveActions(folderId);

	const openFolder = (folder: { id: string; name: string }) => {
		setStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
	};

	const navigateTo = (targetId: string | null) => {
		setStack((prev) => truncateStackTo(prev, targetId));
	};

	const handleCreateFolder = () => {
		const name = window.prompt("Название новой папки");
		if (!name?.trim()) return;
		actions.createFolder.mutate({ name: name.trim(), parentId: folderId });
	};

	const handleRenameFolder = (id: string, current: string) => {
		const name = window.prompt("Новое название папки", current);
		if (!name?.trim() || name.trim() === current) return;
		actions.renameFolder.mutate({ folderId: id, name: name.trim() });
	};

	const handleRenameFile = (id: string, current: string) => {
		const name = window.prompt("Новое имя файла", current);
		if (!name?.trim() || name.trim() === current) return;
		actions.renameFile.mutate({ fileId: id, name: name.trim() });
	};

	const handleDeleteFolder = (id: string, name: string) => {
		if (!window.confirm(`Удалить папку «${name}» и всё её содержимое?`)) return;
		actions.deleteFolder.mutate({ folderId: id });
	};

	const handleDeleteFile = (id: string, name: string) => {
		if (!window.confirm(`Удалить файл «${name}»?`)) return;
		actions.deleteFile.mutate({ fileId: id });
	};

	const handleMoveFileToParent = (id: string) => {
		const parentId = stack.length > 1 ? (stack.at(-2)?.id ?? null) : null;
		actions.moveFile.mutate({ fileId: id, folderId: parentId });
	};

	const data = listing.data;
	const folders = data?.folders ?? [];
	const files = data?.files ?? [];
	const isEmpty = data != null && folders.length === 0 && files.length === 0;

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Breadcrumbs stack={stack} onNavigate={navigateTo} />
				<Button type="button" variant="outline" onClick={handleCreateFolder}>
					<FolderPlus className="size-4" />
					Новая папка
				</Button>
			</div>

			<UploadDropzone folderId={folderId} />

			{!data && listing.isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : isEmpty ? (
				<div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
					Здесь пока пусто. Загрузите файл или создайте папку.
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Имя</TableHead>
								<TableHead className="w-32">Размер</TableHead>
								<TableHead className="w-44">Изменён</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{folders.map((folder) => (
								<TableRow key={`folder:${folder.id}`}>
									<TableCell>
										<button
											type="button"
											onClick={() => openFolder(folder)}
											className="flex items-center gap-2 font-medium hover:underline"
										>
											<Folder className="size-4 text-muted-foreground" />
											<span className="truncate">{folder.name}</span>
										</button>
									</TableCell>
									<TableCell className="text-muted-foreground">—</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{new Date(folder.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label="Действия с папкой"
												>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onSelect={() =>
														handleRenameFolder(folder.id, folder.name)
													}
												>
													<Pencil className="size-4" /> Переименовать
												</DropdownMenuItem>
												<DropdownMenuItem
													onSelect={() =>
														setShareTarget({
															kind: "folder",
															id: folder.id,
															name: folder.name,
														})
													}
												>
													<Share2 className="size-4" /> Поделиться
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													onSelect={() =>
														handleDeleteFolder(folder.id, folder.name)
													}
												>
													<Trash2 className="size-4" /> Удалить
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							))}

							{files.map((file) => (
								<TableRow key={`file:${file.id}`}>
									<TableCell>
										<div className="flex items-center gap-2">
											<FileIcon className="size-4 text-muted-foreground" />
											<span className="truncate">{file.name}</span>
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground tabular-nums">
										{formatBytes(Number(file.sizeBytes))}
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{new Date(file.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label="Действия с файлом"
												>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onSelect={() => void actions.download(file.id)}
												>
													<Download className="size-4" /> Скачать
												</DropdownMenuItem>
												<DropdownMenuItem
													onSelect={() => handleRenameFile(file.id, file.name)}
												>
													<Pencil className="size-4" /> Переименовать
												</DropdownMenuItem>
												<DropdownMenuItem
													onSelect={() =>
														setShareTarget({
															kind: "file",
															id: file.id,
															name: file.name,
														})
													}
												>
													<Share2 className="size-4" /> Поделиться
												</DropdownMenuItem>
												{stack.length > 0 ? (
													<DropdownMenuItem
														onSelect={() => handleMoveFileToParent(file.id)}
													>
														<Folder className="size-4" /> На уровень выше
													</DropdownMenuItem>
												) : null}
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													onSelect={() => handleDeleteFile(file.id, file.name)}
												>
													<Trash2 className="size-4" /> Удалить
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<ShareDialog
				target={shareTarget}
				onOpenChange={(open) => {
					if (!open) setShareTarget(null);
				}}
			/>
		</div>
	);
}
