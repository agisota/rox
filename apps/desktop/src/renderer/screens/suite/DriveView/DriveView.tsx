import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { AnimatedPresence } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Folder as FolderIcon, UploadCloud } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { SuiteQueryError } from "../components/SuiteQueryError";
import type { DriveBrowserModel } from "./components/browserModel";
import { CreateFolderDialog } from "./components/CreateFolderDialog";
import { DeleteAlert, type DeleteTarget } from "./components/DeleteAlert";
import { DriveEmptyState } from "./components/DriveEmptyState";
import { DriveFolderTree } from "./components/DriveFolderTree";
import { DriveGridView } from "./components/DriveGridView";
import { DriveListView } from "./components/DriveListView";
import { DriveToolbar } from "./components/DriveToolbar";
import { PreviewSheet } from "./components/PreviewSheet";
import { QuotaCard } from "./components/QuotaCard";
import { ShareDialog, type ShareTarget } from "./components/ShareDialog";
import { SharesSheet } from "./components/SharesSheet";
import { UploadTray } from "./components/UploadTray";
import { useCopyShareLink } from "./hooks/useCopyShareLink";
import { useDriveActions } from "./hooks/useDriveActions";
import { useDriveDrop } from "./hooks/useDriveDrop";
import { useDriveUpload } from "./hooks/useDriveUpload";
import { useDriveListing, useDriveViewState } from "./hooks/useDriveViewState";
import {
	type DriveFile,
	type DriveFolder,
	type EntryRef,
	refKey,
} from "./types";
import { type FolderCrumb, truncateStackTo } from "./utils/breadcrumbPath";
import {
	type DriveDragData,
	type DriveDropTarget,
	dragRefs,
	isDropAllowed,
} from "./utils/dnd";

/**
 * Desktop Drive — a fast, glass, RU-localized file manager over the per-user
 * 10 GiB cloud store (Neon metadata + R2 bytes via presigned PUT/GET). Replaces
 * the old centered max-w stub with a full-bleed two-pane shell: a glass toolbar
 * (breadcrumb · search · Сетка/Список · sort · Новая папка · Загрузить), a left
 * rail with the storage QuotaCard, and a main browser with List (virtualized
 * table) and Grid (tiles) modes over one selection model.
 *
 * All data flows through the already-complete shared cloud tRPC `drive.*`
 * router (cache-first per AGENTS.md #9: the last-known listing renders
 * instantly; skeleton only when there is genuinely no data). Uploads use the
 * presigned R2 pipeline (SHA-256 → requestUpload → direct XHR PUT with real
 * progress → confirmUpload), never `filesystem.writeFile`.
 */
export function DriveView() {
	const trpc = useTRPC();

	// --- navigation -----------------------------------------------------------
	const [stack, setStack] = useState<FolderCrumb[]>([]);
	const folderId = stack.at(-1)?.id ?? null;

	const listing = useQuery(trpc.drive.listFolder.queryOptions({ folderId }));

	// --- view + filter --------------------------------------------------------
	const { view, setView, sort, toggleSort } = useDriveViewState();
	const [searchRaw, setSearchRaw] = useState("");
	const [search, setSearch] = useState("");
	// 200ms debounce so typing does not thrash the (memoised) filter.
	useEffect(() => {
		const handle = window.setTimeout(() => setSearch(searchRaw), 200);
		return () => window.clearTimeout(handle);
	}, [searchRaw]);

	// Reset transient view state whenever the folder changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: folderId is the reset trigger
	useEffect(() => {
		setSelected(new Set());
		setRenaming(null);
		setSearchRaw("");
		setSearch("");
	}, [folderId]);

	const rawFolders = (listing.data?.folders ?? []) as unknown as DriveFolder[];
	const rawFiles = (listing.data?.files ?? []) as unknown as DriveFile[];
	const { folders, files } = useDriveListing(
		rawFolders,
		rawFiles,
		search,
		sort,
	);

	const hasData = listing.data != null;
	const isEmpty = hasData && rawFolders.length === 0 && rawFiles.length === 0;

	// --- mutations + upload ---------------------------------------------------
	const actions = useDriveActions(folderId);
	const upload = useDriveUpload();

	// --- overlays state -------------------------------------------------------
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [renaming, setRenaming] = useState<EntryRef | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
	const [sharesOpen, setSharesOpen] = useState(false);
	const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);

	// --- navigation handlers --------------------------------------------------
	const openFolder = useCallback((folder: DriveFolder) => {
		setStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
	}, []);

	const navigateTo = useCallback((targetId: string | null) => {
		setStack((prev) => truncateStackTo(prev, targetId));
	}, []);

	// Tree-node click: if the folder is already on the visited stack, truncate
	// back to it (same as a breadcrumb click); otherwise drill into it (push),
	// reusing the same navigation model the main area uses.
	const openOrNavigate = useCallback((folder: { id: string; name: string }) => {
		setStack((prev) => {
			const index = prev.findIndex((crumb) => crumb.id === folder.id);
			if (index !== -1) return prev.slice(0, index + 1);
			return [...prev, { id: folder.id, name: folder.name }];
		});
	}, []);

	// --- selection (modifier-aware) -------------------------------------------
	const orderedRefs = useMemo<EntryRef[]>(
		() => [
			...folders.map((f) => ({ kind: "folder" as const, id: f.id })),
			...files.map((f) => ({ kind: "file" as const, id: f.id })),
		],
		[folders, files],
	);
	const lastClickedRef = useRef<EntryRef | null>(null);

	const onSelect = useCallback(
		(ref: EntryRef, mods: { metaKey: boolean; shiftKey: boolean }) => {
			setSelected((prev) => {
				const key = refKey(ref);
				if (mods.shiftKey && lastClickedRef.current) {
					// Range select between last-clicked and this entry.
					const from = orderedRefs.findIndex(
						(r) => refKey(r) === refKey(lastClickedRef.current as EntryRef),
					);
					const to = orderedRefs.findIndex((r) => refKey(r) === key);
					if (from !== -1 && to !== -1) {
						const [lo, hi] = from < to ? [from, to] : [to, from];
						const next = new Set(prev);
						for (let i = lo; i <= hi; i += 1) next.add(refKey(orderedRefs[i]));
						return next;
					}
				}
				if (mods.metaKey) {
					const next = new Set(prev);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					lastClickedRef.current = ref;
					return next;
				}
				lastClickedRef.current = ref;
				return new Set([key]);
			});
		},
		[orderedRefs],
	);

	// --- rename ---------------------------------------------------------------
	const startRename = useCallback((ref: EntryRef) => setRenaming(ref), []);
	const cancelRename = useCallback(() => setRenaming(null), []);
	const commitRename = useCallback(
		(ref: EntryRef, name: string) => {
			setRenaming(null);
			if (ref.kind === "folder") {
				actions.renameFolder.mutate({ folderId: ref.id, name });
			} else {
				actions.renameFile.mutate({ fileId: ref.id, name });
			}
		},
		[actions],
	);

	// --- copy share link (mint + copy in one step) ----------------------------
	const copyLink = useCopyShareLink();

	// --- delete ---------------------------------------------------------------
	const confirmDelete = useCallback(() => {
		if (!deleteTarget) return;
		if (deleteTarget.kind === "folder") {
			actions.deleteFolder.mutate({ folderId: deleteTarget.id });
		} else {
			actions.deleteFile.mutate({ fileId: deleteTarget.id });
		}
		setDeleteTarget(null);
		setSelected((prev) => {
			const next = new Set(prev);
			next.delete(refKey(deleteTarget));
			return next;
		});
	}, [actions, deleteTarget]);

	// --- upload triggers ------------------------------------------------------
	const triggerPicker = useCallback(() => fileInputRef.current?.click(), []);
	const onFilesChosen = useCallback(
		(files: File[]) => {
			if (files.length > 0) void upload.uploadFiles(files, folderId);
		},
		[upload, folderId],
	);
	// --- internal drag-to-move (dnd-kit) --------------------------------------
	// Disable the OS-file-drop scrim while an internal item-move drag is active
	// so the two never fight; OS drags additionally carry `Files` (checked in
	// useDriveDrop), this guard just hides the upload affordance during a move.
	const [activeDrag, setActiveDrag] = useState<DriveDragData | null>(null);
	const drop = useDriveDrop(onFilesChosen, activeDrag === null);

	const sensors = useSensors(
		// 6px activation distance so a click still selects without starting a drag.
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 180, tolerance: 8 },
		}),
	);

	const dragDataFor = useCallback(
		(ref: EntryRef): DriveDragData => {
			const refs = dragRefs(ref, selected, orderedRefs);
			const nameOf = (r: EntryRef) =>
				r.kind === "folder"
					? folders.find((f) => f.id === r.id)?.name
					: files.find((f) => f.id === r.id)?.name;
			const label =
				refs.length > 1 ? `${refs.length} объект.` : (nameOf(ref) ?? "Объект");
			return { ref, refs, label };
		},
		[selected, orderedRefs, folders, files],
	);

	const onDragStart = useCallback((event: DragStartEvent) => {
		const data = event.active.data.current as DriveDragData | undefined;
		if (data) setActiveDrag(data);
	}, []);

	const onDragCancel = useCallback(() => setActiveDrag(null), []);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const data = event.active.data.current as DriveDragData | undefined;
			const target = event.over?.data.current as
				| { target?: DriveDropTarget }
				| undefined;
			setActiveDrag(null);
			if (!data || !target?.target) return;
			const dropTarget = target.target;
			if (!isDropAllowed(data.refs, dropTarget, folderId)) return;
			const targetFolderId = dropTarget.kind === "root" ? null : dropTarget.id;
			for (const ref of data.refs) {
				if (ref.kind === "folder") {
					actions.moveFolder.mutate({
						folderId: ref.id,
						parentId: targetFolderId,
					});
				} else {
					actions.moveFile.mutate({
						fileId: ref.id,
						folderId: targetFolderId,
					});
				}
			}
			setSelected(new Set());
		},
		[actions, folderId],
	);

	// --- keyboard model -------------------------------------------------------
	const onKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (renaming) return; // inline rename owns the keyboard
			const target = event.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
				event.preventDefault();
				setSelected(new Set(orderedRefs.map(refKey)));
				return;
			}
			if (event.key === "Escape") {
				setSelected(new Set());
				return;
			}
			// Single-selection convenience: F2 rename, Delete remove.
			if (selected.size === 1) {
				const onlyKey = [...selected][0];
				const ref = orderedRefs.find((r) => refKey(r) === onlyKey);
				if (!ref) return;
				if (event.key === "F2") {
					event.preventDefault();
					startRename(ref);
				} else if (event.key === "Delete" || event.key === "Backspace") {
					event.preventDefault();
					const name =
						ref.kind === "folder"
							? folders.find((f) => f.id === ref.id)?.name
							: files.find((f) => f.id === ref.id)?.name;
					setDeleteTarget({ kind: ref.kind, id: ref.id, name: name ?? "" });
				}
			}
		},
		[renaming, selected, orderedRefs, folders, files, startRename],
	);

	// --- model shared by both views -------------------------------------------
	const model: DriveBrowserModel = {
		folders,
		files,
		selected,
		renaming,
		onSelect,
		onOpenFolder: openFolder,
		onOpenFile: setPreviewFile,
		onStartRename: startRename,
		onCommitRename: commitRename,
		onCancelRename: cancelRename,
		onDownload: (fileId) => void actions.download(fileId),
		onShareFolder: (folder) =>
			setShareTarget({ kind: "folder", id: folder.id, name: folder.name }),
		onShareFile: (file) =>
			setShareTarget({ kind: "file", id: file.id, name: file.name }),
		onCopyLinkFolder: (folder) => void copyLink({ folderId: folder.id }),
		onCopyLinkFile: (file) => void copyLink({ fileId: file.id }),
		onDeleteFolder: (folder) =>
			setDeleteTarget({ kind: "folder", id: folder.id, name: folder.name }),
		onDeleteFile: (file) =>
			setDeleteTarget({ kind: "file", id: file.id, name: file.name }),
		dragDataFor,
		isMoving: activeDrag !== null,
	};

	return (
		<DashboardSurface width="full" bare>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragCancel={onDragCancel}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: container keyboard shortcuts */}
				<div
					className="relative grid h-full min-h-0 grid-cols-[240px_1fr] overflow-hidden"
					onKeyDown={onKeyDown}
				>
					{/* Left rail: lazy folder tree (top) + sticky QuotaCard (bottom) */}
					<aside className="flex min-h-0 flex-col gap-3 border-border/60 border-r p-3">
						<DriveFolderTree
							path={stack}
							activeId={folderId}
							onNavigate={(folder) =>
								folder === null ? navigateTo(null) : openOrNavigate(folder)
							}
							droppable={activeDrag !== null}
						/>
						<div className="mt-auto">
							<QuotaCard />
						</div>
					</aside>

					{/* Main column */}
					<div className="flex min-h-0 flex-col">
						<DriveToolbar
							stack={stack}
							onNavigate={navigateTo}
							query={searchRaw}
							onQuery={setSearchRaw}
							view={view}
							onView={setView}
							sort={sort}
							onSort={toggleSort}
							onCreateFolder={() => setCreateOpen(true)}
							onUpload={triggerPicker}
							onOpenShares={() => setSharesOpen(true)}
							droppableSegments={activeDrag !== null}
						/>

						{/* biome-ignore lint/a11y/noStaticElementInteractions: whole-area file drop zone */}
						<div
							className="relative flex min-h-0 flex-1 flex-col"
							onDragEnter={drop.onDragEnter}
							onDragOver={drop.onDragOver}
							onDragLeave={drop.onDragLeave}
							onDrop={drop.onDrop}
						>
							{listing.isError ? (
								<div className="p-6">
									<SuiteQueryError
										message={listing.error.message}
										onRetry={() => listing.refetch()}
									/>
								</div>
							) : !hasData && listing.isLoading ? (
								<LoadingState view={view} />
							) : isEmpty ? (
								<DriveEmptyState
									isRoot={stack.length === 0}
									onUpload={triggerPicker}
									onCreateFolder={() => setCreateOpen(true)}
								/>
							) : view === "list" ? (
								<DriveListView {...model} sort={sort} onSort={toggleSort} />
							) : (
								<DriveGridView {...model} />
							)}

							{/* Drag scrim */}
							<AnimatedPresence>
								{drop.isDragging ? (
									<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
										<div className="glass-panel flex flex-col items-center gap-2 rounded-2xl border border-primary/40 border-dashed px-10 py-8">
											<UploadCloud className="size-9 text-primary" />
											<p className="font-medium text-foreground text-sm">
												Отпустите, чтобы загрузить
											</p>
										</div>
									</div>
								) : null}
							</AnimatedPresence>
						</div>
					</div>

					{/* Ghost of the dragged entry / multi-selection. */}
					<DragOverlay dropAnimation={null}>
						{activeDrag ? (
							<div className="glass-panel pointer-events-none flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-1.5 text-sm shadow-lg">
								<FolderIcon className="size-4 text-primary" />
								<span className="font-medium">{activeDrag.label}</span>
							</div>
						) : null}
					</DragOverlay>

					{/* Hidden picker */}
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(event) => {
							const chosen = event.target.files
								? Array.from(event.target.files)
								: [];
							onFilesChosen(chosen);
							event.target.value = "";
						}}
					/>

					{/* Overlays */}
					<UploadTray
						items={upload.items}
						onRetry={(id) => void upload.retry(id)}
						onDismiss={upload.dismiss}
						onClear={upload.clearCompleted}
					/>
					<PreviewSheet
						file={previewFile}
						onOpenChange={(open) => {
							if (!open) setPreviewFile(null);
						}}
						getPreviewUrl={actions.getPreviewUrl}
						onDownload={(fileId) => void actions.download(fileId)}
						onShare={(file) =>
							setShareTarget({ kind: "file", id: file.id, name: file.name })
						}
					/>
					<ShareDialog
						target={shareTarget}
						onOpenChange={(open) => {
							if (!open) setShareTarget(null);
						}}
					/>
					<SharesSheet open={sharesOpen} onOpenChange={setSharesOpen} />
					<CreateFolderDialog
						open={createOpen}
						pending={actions.createFolder.isPending}
						onOpenChange={setCreateOpen}
						onCreate={(name) =>
							actions.createFolder.mutate(
								{ name, parentId: folderId },
								{ onSuccess: () => setCreateOpen(false) },
							)
						}
					/>
					<DeleteAlert
						target={deleteTarget}
						pending={
							actions.deleteFile.isPending || actions.deleteFolder.isPending
						}
						onConfirm={confirmDelete}
						onOpenChange={(open) => {
							if (!open) setDeleteTarget(null);
						}}
					/>
				</div>
			</DndContext>
		</DashboardSurface>
	);
}

function LoadingState({ view }: { view: "list" | "grid" }) {
	const cells = [0, 1, 2, 3, 4, 5, 6, 7];
	if (view === "grid") {
		return (
			<div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 p-3">
				{cells.map((i) => (
					<div
						key={i}
						className="h-40 animate-pulse rounded-xl border border-border/60 bg-muted/30"
					/>
				))}
			</div>
		);
	}
	return (
		<div className="space-y-2 p-3">
			{cells.map((i) => (
				<div
					key={i}
					className={cn("h-10 animate-pulse rounded-md bg-muted/30")}
				/>
			))}
		</div>
	);
}
