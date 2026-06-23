import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	FilePlus,
	Folder,
	FolderPlus,
	HardDrive,
	Link2,
} from "lucide-react";
import { useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { SuiteQueryError } from "../components/SuiteQueryError";
import { SuiteScreen } from "../components/SuiteScreen";
import { formatFileSize } from "../utils/formatFileSize";

interface Crumb {
	id: string | null;
	name: string;
}

/** Public share base — files/folders resolve at `rox.one/d/<token>`. */
const SHARE_BASE = "https://rox.one/d";

/**
 * Drive folder/file browser (Suite P0). Reads `drive.listFolder` for the current
 * folder, supports drilling into folders via a breadcrumb trail, creating a
 * folder, and minting a public share link for a file or folder
 * (`drive.createShare`). Bytes never proxy through the app — share/download URLs
 * are presigned server-side; P0 surfaces share-link creation only.
 *
 * Cache-first (AGENTS.md rule 9): existing rows render immediately; the skeleton
 * shows only when there is genuinely no data and the query is still loading.
 */
export function DriveView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [trail, setTrail] = useState<Crumb[]>([{ id: null, name: "Drive" }]);
	const currentFolderId = trail[trail.length - 1]?.id ?? null;

	const [createOpen, setCreateOpen] = useState(false);
	const [folderName, setFolderName] = useState("");
	const [shareUrl, setShareUrl] = useState<string | null>(null);

	const listQuery = useQuery(
		trpc.drive.listFolder.queryOptions({ folderId: currentFolderId }),
	);

	const createFolder = useMutation(
		trpc.drive.createFolder.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.drive.listFolder.queryKey({
						folderId: currentFolderId,
					}),
				});
				setCreateOpen(false);
				setFolderName("");
			},
			onError: (error) => {
				logger.error("[DriveView] createFolder failed", error);
				toast.error("Не удалось создать папку");
			},
		}),
	);

	const createShare = useMutation(
		trpc.drive.createShare.mutationOptions({
			onSuccess: (row) => {
				const url = `${SHARE_BASE}/${row.token}`;
				setShareUrl(url);
				void navigator.clipboard?.writeText(url).then(
					() => toast.success("Ссылка скопирована"),
					() => toast.success("Ссылка создана"),
				);
			},
			onError: (error) => {
				logger.error("[DriveView] createShare failed", error);
				toast.error("Не удалось создать ссылку");
			},
		}),
	);

	const folders = listQuery.data?.folders ?? [];
	const files = listQuery.data?.files ?? [];
	const isEmpty = folders.length === 0 && files.length === 0;

	const openFolder = (id: string, name: string) => {
		setTrail((prev) => [...prev, { id, name }]);
	};

	const goToCrumb = (index: number) => {
		setTrail((prev) => prev.slice(0, index + 1));
	};

	return (
		<SuiteScreen
			title="Drive"
			description="Файлы и папки, общий доступ по ссылке"
			icon={HardDrive}
			actions={
				<Button onClick={() => setCreateOpen(true)}>
					<FolderPlus className="size-4" /> Новая папка
				</Button>
			}
		>
			{/* Breadcrumb trail */}
			<nav className="mb-4 flex flex-wrap items-center gap-1 text-sm">
				{trail.map((crumb, index) => (
					<span key={crumb.id ?? "root"} className="flex items-center gap-1">
						{index > 0 && (
							<ChevronRight className="size-3.5 text-muted-foreground" />
						)}
						<button
							type="button"
							onClick={() => goToCrumb(index)}
							disabled={index === trail.length - 1}
							className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:font-medium disabled:text-foreground"
						>
							{crumb.name}
						</button>
					</span>
				))}
			</nav>

			{listQuery.isError && (
				<SuiteQueryError
					message={listQuery.error.message}
					onRetry={() => listQuery.refetch()}
				/>
			)}

			{isEmpty && listQuery.isLoading && (
				<div className="space-y-2">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			)}

			{isEmpty && listQuery.isSuccess && (
				<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-20 text-center">
					<FilePlus className="mb-3 size-8 text-muted-foreground" />
					<span className="text-foreground text-sm">Папка пуста</span>
					<span className="mt-1 max-w-sm text-muted-foreground text-xs">
						Создайте подпапку, чтобы организовать файлы.
					</span>
				</div>
			)}

			{!isEmpty && (
				<div className="overflow-hidden rounded-lg border border-border">
					{folders.map((folder) => (
						<div
							key={folder.id}
							className="flex items-center gap-3 border-border border-b px-3 py-2.5 last:border-b-0 hover:bg-accent/40"
						>
							<button
								type="button"
								onClick={() => openFolder(folder.id, folder.name)}
								className="flex min-w-0 flex-1 items-center gap-3 text-left"
							>
								<Folder className="size-4 shrink-0 text-primary" />
								<span className="truncate text-sm">{folder.name}</span>
							</button>
							<Button
								size="sm"
								variant="ghost"
								aria-label={`Поделиться папкой ${folder.name}`}
								disabled={createShare.isPending}
								onClick={() => createShare.mutate({ folderId: folder.id })}
							>
								<Link2 className="size-4" />
							</Button>
						</div>
					))}
					{files.map((file) => (
						<div
							key={file.id}
							className="flex items-center gap-3 border-border border-b px-3 py-2.5 last:border-b-0 hover:bg-accent/40"
						>
							<FilePlus className="size-4 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate text-sm">
								{file.name}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatFileSize(file.sizeBytes)}
							</span>
							<Button
								size="sm"
								variant="ghost"
								aria-label={`Поделиться файлом ${file.name}`}
								disabled={createShare.isPending}
								onClick={() => createShare.mutate({ fileId: file.id })}
							>
								<Link2 className="size-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			{/* Create folder dialog */}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Новая папка</DialogTitle>
						<DialogDescription>
							Папка будет создана в текущем расположении.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="drive-folder-name">Название</Label>
						<Input
							id="drive-folder-name"
							value={folderName}
							onChange={(e) => setFolderName(e.target.value)}
							placeholder="Например: Документы"
							onKeyDown={(e) => {
								if (e.key === "Enter" && folderName.trim()) {
									createFolder.mutate({
										name: folderName.trim(),
										parentId: currentFolderId,
									});
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button
							disabled={!folderName.trim() || createFolder.isPending}
							onClick={() =>
								createFolder.mutate({
									name: folderName.trim(),
									parentId: currentFolderId,
								})
							}
						>
							Создать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Share link dialog */}
			<Dialog
				open={shareUrl !== null}
				onOpenChange={(open) => {
					if (!open) setShareUrl(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Ссылка для доступа</DialogTitle>
						<DialogDescription>
							Любой, у кого есть ссылка, сможет открыть этот ресурс.
						</DialogDescription>
					</DialogHeader>
					<Input
						readOnly
						value={shareUrl ?? ""}
						className="cursor-text select-text"
						onFocus={(e) => e.currentTarget.select()}
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								if (shareUrl) {
									void navigator.clipboard
										?.writeText(shareUrl)
										.then(() => toast.success("Ссылка скопирована"));
								}
							}}
						>
							Скопировать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SuiteScreen>
	);
}
