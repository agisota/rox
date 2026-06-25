import type {
	FileTreeRenameEvent,
	FileTreeRowDecoration,
	FileTreeRowDecorationContext,
	ContextMenuItem as PierreContextMenuItem,
	ContextMenuOpenContext as PierreContextMenuOpenContext,
} from "@pierre/trees";
import {
	FileTree as PierreFileTree,
	useFileTree as usePierreFileTree,
} from "@pierre/trees/react";
import type { AppRouter } from "@rox/host-service";
import { FilePanelHeader } from "@rox/ui/atoms/FilePanelHeader";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { RevealFlash, useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { workspaceTrpc } from "@rox/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import {
	ChevronUp,
	FilePlus,
	FolderPlus,
	FoldVertical,
	Loader2,
	MoreHorizontal,
	RefreshCw,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGitStatusMap } from "renderer/hooks/host-service/useGitStatusMap";
import { useExperimentalFeature } from "renderer/hooks/useExperimentalFeature";
import {
	ShadowClickHint,
	usePierreRowClickPolicy,
	useSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import { useFallthroughIcons } from "renderer/lib/fileIcons";
import { createPierreTreeStyle } from "renderer/lib/pierreTree";
import { useExpandedDirs } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useExpandedDirs";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { PierreRowContextMenu } from "../PierreRowContextMenu";
import { ArtifactsPanel } from "./components/ArtifactsPanel";
import { FileMenuItems } from "./components/FileMenuItems";
import { FilesTabDropOverlay } from "./components/FilesTabDropOverlay";
import { FilesTabHeaderButton } from "./components/FilesTabHeaderButton";
import { FolderMenuItems } from "./components/FolderMenuItems";
import { TodosPanel } from "./components/TodosPanel";
import {
	FILE_EXPLORER_INDENT,
	FILE_EXPLORER_OVERSCAN,
	FILE_EXPLORER_ROW_HEIGHT,
} from "./constants";
import { useFilesTabActions } from "./hooks/useFilesTabActions";
import { useFilesTabBridge } from "./hooks/useFilesTabBridge";
import { useFilesTabDrop } from "./hooks/useFilesTabDrop";
import { useFileTreeBlame } from "./hooks/useFileTreeBlame";
import { useFileTreeSizes } from "./hooks/useFileTreeSizes";
import { buildPierreGitStatus } from "./utils/buildPierreGitStatus";
import { formatBlameDecoration } from "./utils/formatBlameDecoration";
import { formatFileSize } from "./utils/formatFileSize";
import { stripTrailingSlash, toAbs, toRel } from "./utils/treePath";

const TREE_STYLE = createPierreTreeStyle({
	rowHeight: FILE_EXPLORER_ROW_HEIGHT,
	levelIndent: FILE_EXPLORER_INDENT,
	withSearchChrome: true,
});

// The size column (F31) renders through Pierre's decoration lane, which is
// already right-aligned and muted; tabular figures keep the digits from
// shifting as rows scroll. Pierre's decoration text variant has no className
// hook, so we reach the shadow-DOM span via `unsafeCSS` (same escape hatch the
// diff viewer uses).
const TREE_UNSAFE_CSS = `
	[data-item-section='decoration'] > span {
		font-variant-numeric: tabular-nums;
	}
`;

type GitStatusData = inferRouterOutputs<AppRouter>["git"]["getStatus"];

type FilePanelTabId = "files" | "artifacts" | "todos";

interface FilesTabProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	selectedFilePath?: string;
	pendingReveal?: {
		path: string;
		isDirectory: boolean;
	} | null;
	workspaceId: string;
	gitStatus: GitStatusData | undefined;
	/** Open an artifact (canvas) by id from the Artifacts sub-tab. */
	onSelectArtifact?: (canvasId: string) => void;
	/** Close/hide the file panel from the header icon-row, when supported. */
	onClose?: () => void;
}

export function FilesTab({
	onSelectFile,
	selectedFilePath,
	pendingReveal,
	workspaceId,
	gitStatus,
	onSelectArtifact,
	onClose,
}: FilesTabProps) {
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const rootPath = workspaceQuery.data?.worktreePath ?? "";

	const [activePanelTab, setActivePanelTab] = useState<FilePanelTabId>("files");
	const uploadInputRef = useRef<HTMLInputElement>(null);

	// Artifacts count for the tablist badge — the same `canvas.list` query the
	// Artifacts panel renders (shared cache, so no extra round-trip).
	const artifactsQuery = workspaceTrpc.canvas.list.useQuery(
		{ workspaceId },
		{ enabled: !!workspaceId },
	);
	const artifactsCount = artifactsQuery.data?.length ?? 0;

	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const filePolicy = useSidebarFilePolicy();
	const shouldAnimate = useShouldAnimate();
	const [flashRect, setFlashRect] = useState<DOMRect | null>(null);

	const { fileStatusByPath, folderStatusByPath, ignoredPaths } =
		useGitStatusMap(gitStatus);

	// Pierre's `gitStatus` is consumed only at construction; live updates
	// flow via model.setGitStatus in an effect below.
	const initialGitStatusEntriesRef = useRef(
		buildPierreGitStatus(fileStatusByPath, folderStatusByPath, ignoredPaths),
	);

	// Selection feedback loop guard: when the parent re-renders after we
	// fired onSelectFile, syncing selectedFilePath back into the model would
	// retrigger our onSelectionChange. Skip the next selection echo.
	const lastSelectedFromUserRef = useRef<string | null>(null);

	// `useFileTree` constructs the model once and never re-reads its options,
	// so any callback we pass directly would close over stale state. Route
	// every callback through a ref so we can update it on each render while
	// keeping a stable function identity for Pierre.
	const handlersRef = useRef({
		onSelect(_path: string) {},
		onRename(_event: FileTreeRenameEvent) {},
		renderRowDecoration(
			_ctx: FileTreeRowDecorationContext,
		): FileTreeRowDecoration | null {
			return null;
		},
	});

	const { model } = usePierreFileTree({
		paths: [],
		initialExpansion: "closed",
		search: false,
		renaming: {
			onRename: (event) => handlersRef.current.onRename(event),
			onError: (message) => toast.error(message),
		},
		gitStatus: initialGitStatusEntriesRef.current,
		icons: { set: "complete", colored: true },
		itemHeight: FILE_EXPLORER_ROW_HEIGHT,
		overscan: FILE_EXPLORER_OVERSCAN,
		stickyFolders: true,
		unsafeCSS: TREE_UNSAFE_CSS,
		onSelectionChange: (paths) => {
			const last = paths[paths.length - 1];
			if (!last) return;
			// Pierre uses trailing-slash paths for directories; we only fire
			// onSelectFile for files (clicking a folder toggles expansion).
			if (last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
		renderRowDecoration: (ctx) => handlersRef.current.renderRowDecoration(ctx),
	});

	// Persisted expanded-directory set (F32). The bridge reads the snapshot on
	// root-load to prefetch + re-expand, and reports each expand/collapse edge
	// back so it survives reload and syncs cross-device through the local-state
	// collection.
	const expandedDirsApi = useExpandedDirs(workspaceId);
	const bridge = useFilesTabBridge({
		model,
		workspaceId,
		rootPath,
		getPersistedExpandedDirs: expandedDirsApi.getSnapshot,
		onExpandedChange: expandedDirsApi.setExpanded,
	});

	// Re-apply the current git status to force Pierre to re-render its rows
	// (and thus re-run `renderRowDecoration`). Read the entries from a ref so the
	// callback identity stays stable for the size hook while still painting the
	// latest status. Mirrors how `useFallthroughIcons` repaints via `setIcons`.
	const gitStatusEntriesRef = useRef(initialGitStatusEntriesRef.current);
	gitStatusEntriesRef.current = buildPierreGitStatus(
		fileStatusByPath,
		folderStatusByPath,
		ignoredPaths,
	);
	const repaintTree = useCallback(() => {
		model.setGitStatus(gitStatusEntriesRef.current);
	}, [model]);

	// Resolve per-file sizes for the tree (F31); repaint when a batch lands so
	// the freshly-loaded sizes paint into Pierre's decoration lane.
	const sizes = useFileTreeSizes({
		model,
		knownPaths: bridge.knownPaths,
		workspaceId,
		rootPath,
		onSizesLoaded: repaintTree,
	});

	// Identity-aware tree blame (F35) is shared-workspace-only: in a solo
	// workspace every file's last author is just "me", so it's pure noise —
	// gate it on the same `collaboration.presence` signal that decides whether
	// this workspace is collaborative (presence/byline surfaces use it too).
	const presence = useExperimentalFeature("collaboration.presence");
	const blameEnabled =
		presence.state.enabled && presence.state.availability === "available";
	const blame = useFileTreeBlame({
		model,
		knownPaths: bridge.knownPaths,
		workspaceId,
		rootPath,
		enabled: blameEnabled,
		onBlameLoaded: repaintTree,
	});
	const { reveal, startCreating, handleRename, handleDelete, collapseAll } =
		useFilesTabActions({
			model,
			bridge,
			rootPath,
			workspaceId,
			selectedFilePath,
			onSelectFile,
			shouldAnimate,
			onRevealed: setFlashRect,
		});
	const drop = useFilesTabDrop({ model, bridge, rootPath, workspaceId });

	// Push live git status updates into Pierre.
	useEffect(() => {
		model.setGitStatus(
			buildPierreGitStatus(fileStatusByPath, folderStatusByPath, ignoredPaths),
		);
	}, [model, fileStatusByPath, folderStatusByPath, ignoredPaths]);

	useFallthroughIcons(model);

	// Reflect external selection changes (e.g. tab switch) back into the model.
	useEffect(() => {
		if (!selectedFilePath || !rootPath) return;
		if (lastSelectedFromUserRef.current === selectedFilePath) {
			lastSelectedFromUserRef.current = null;
			return;
		}
		const rel = toRel(rootPath, selectedFilePath);
		if (!bridge.knownPaths.has(rel)) return;
		model.focusPath(rel);
	}, [model, selectedFilePath, rootPath, bridge.knownPaths]);

	useEffect(() => {
		if (!pendingReveal || !rootPath) return;
		void reveal(pendingReveal.path, pendingReveal.isDirectory);
	}, [pendingReveal, rootPath, reveal]);

	// Wire the ref-based handlers so Pierre's stable callbacks always reach
	// the latest closures. Updated on every render — no diffing needed.
	handlersRef.current.onRename = (event) => void handleRename(event);
	handlersRef.current.onSelect = (treePath) => {
		const abs = toAbs(rootPath, treePath);
		// Skip the reveal-induced echo. The reveal flow programmatically
		// selects the just-opened file's row, which fires onSelectionChange
		// synchronously. Without this guard, the echo re-enters onSelectFile
		// → openFilePaneFromTreeClick, which sees active === target and
		// pins the pane we just opened. Real keyboard nav (selection moves
		// to a different file) still gets through.
		if (selectedFilePath === abs) return;
		lastSelectedFromUserRef.current = abs;
		onSelectFile(abs);
	};
	// Pierre's right-aligned decoration lane carries one of two per-file signals.
	// In a shared workspace, identity-aware blame (F35) wins the lane: the last
	// author's initials + relative time, with the byte size folded into the hover
	// title so it isn't lost. In a solo workspace blame is suppressed, so the lane
	// falls back to the file size (F31). Folders carry neither. The git-status row
	// tint is independent — Pierre paints it via `setGitStatus`, not this lane.
	handlersRef.current.renderRowDecoration = (ctx) => {
		if (ctx.item.kind === "directory") return null;
		const size = sizes.getSize(ctx.item.path);
		const sizeTitle = size == null ? null : `${size.toLocaleString()} B`;

		if (blameEnabled) {
			const fileBlame = blame.getBlame(ctx.item.path);
			if (fileBlame) {
				const decoration = formatBlameDecoration(fileBlame);
				return {
					text: decoration.text,
					title: sizeTitle
						? `${decoration.title} · ${sizeTitle}`
						: decoration.title,
				};
			}
			// Blame not resolved yet for this row: still surface the size rather
			// than leaving the lane blank while blame loads in the background.
		}

		if (size == null) return null;
		return { text: formatFileSize(size), title: sizeTitle ?? "" };
	};

	// Hint tooltip uses ShadowClickHint to anchor a single shadcn Tooltip
	// over the hovered row's bounding rect — Pierre owns the row DOM inside
	// an open shadow root, so per-row Tooltip wrappers aren't possible.
	// Folders are excluded since folder intents are hardcoded.
	// The hook fires Pierre's relative path; this surface's external
	// contract is absolute, so wrap each callback to join with `rootPath`.
	const { onClickCapture: handleClickCapture, findFileRow } =
		usePierreRowClickPolicy({
			filePolicy,
			onSelectFile: (rel, openInNewTab) =>
				onSelectFile(toAbs(rootPath, rel), openInNewTab),
			openInExternalEditor: (rel) => openInExternalEditor(toAbs(rootPath, rel)),
		});

	const renderContextMenu = useCallback(
		(item: PierreContextMenuItem, ctx: PierreContextMenuOpenContext) => {
			const isFolder = item.kind === "directory";
			const treePath = isFolder
				? `${stripTrailingSlash(item.path)}/`
				: item.path;
			const abs = toAbs(rootPath, item.path);
			const rel = stripTrailingSlash(item.path);
			return (
				<PierreRowContextMenu
					anchorRect={ctx.anchorRect}
					onClose={ctx.close}
					data-file-tree-context-menu-root="true"
				>
					{isFolder ? (
						<FolderMenuItems
							absolutePath={abs}
							relativePath={rel}
							onNewFile={() => void startCreating("file", abs)}
							onNewFolder={() => void startCreating("folder", abs)}
							onRename={() => model.startRenaming(treePath)}
							onDelete={() => handleDelete(abs, item.name, true)}
						/>
					) : (
						<FileMenuItems
							absolutePath={abs}
							relativePath={rel}
							onOpen={() => onSelectFile(abs)}
							onOpenInNewTab={() => onSelectFile(abs, true)}
							onOpenInEditor={() => openInExternalEditor(abs)}
							onRename={() => model.startRenaming(treePath)}
							onDelete={() => handleDelete(abs, item.name, false)}
						/>
					)}
				</PierreRowContextMenu>
			);
		},
		[
			model,
			rootPath,
			startCreating,
			handleDelete,
			onSelectFile,
			openInExternalEditor,
		],
	);

	// Icon-row (F30): parent / new file / new folder / refresh / upload / kebab /
	// close. Only the Files sub-tab acts on the tree, so the file-mutating
	// actions are disabled while Artifacts/Todos are active.
	const onFilesTab = activePanelTab === "files";
	const headerActions = (
		<>
			<FilesTabHeaderButton
				icon={ChevronUp}
				label="К корню"
				onClick={collapseAll}
			/>
			<FilesTabHeaderButton
				icon={FilePlus}
				label="Новый файл"
				onClick={() => void startCreating("file")}
			/>
			<FilesTabHeaderButton
				icon={FolderPlus}
				label="Новая папка"
				onClick={() => void startCreating("folder")}
			/>
			<FilesTabHeaderButton
				icon={RefreshCw}
				label="Обновить"
				loading={bridge.isRefreshing}
				onClick={() => void bridge.doRefresh()}
			/>
			<FilesTabHeaderButton
				icon={Upload}
				label="Загрузить"
				onClick={() => uploadInputRef.current?.click()}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Ещё"
						className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-tertiary/20 hover:text-foreground"
					>
						<MoreHorizontal className="size-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => collapseAll()}>
						<FoldVertical className="size-3.5" />
						Свернуть всё
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => uploadInputRef.current?.click()}>
						<Upload className="size-3.5" />
						Загрузить файлы
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{onClose && (
				<FilesTabHeaderButton icon={X} label="Закрыть" onClick={onClose} />
			)}
		</>
	);

	const panelHeader = (
		<FilePanelHeader
			breadcrumb={[{ id: "root", label: "Workspace" }]}
			hiddenIndicator={ignoredPaths.size > 0}
			gitBadge={gitStatus?.currentBranch?.name ?? undefined}
			tabs={[
				{ id: "files", label: "Файлы" },
				{ id: "artifacts", label: "Артефакты", count: artifactsCount },
				{ id: "todos", label: "Задачи" },
			]}
			activeTab={activePanelTab}
			onTabChange={(id) => setActivePanelTab(id as FilePanelTabId)}
			actions={onFilesTab ? headerActions : undefined}
		/>
	);

	const uploadInput = (
		<input
			ref={uploadInputRef}
			type="file"
			multiple
			className="hidden"
			onChange={(e) => {
				const files = e.target.files ? Array.from(e.target.files) : [];
				drop.uploadFiles(files);
				// Reset so picking the same file again re-fires onChange.
				e.target.value = "";
			}}
		/>
	);

	if (!rootPath) {
		return (
			<div className="flex h-full min-h-0 flex-col overflow-hidden">
				{panelHeader}
				<div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
					{workspaceQuery.isLoading ? (
						<>
							<Loader2 className="size-3.5 animate-spin" />
							<span>Загрузка файлов...</span>
						</>
					) : (
						"Workspace worktree not available"
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			{panelHeader}
			{uploadInput}
			{activePanelTab === "artifacts" ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<ArtifactsPanel
						workspaceId={workspaceId}
						onSelectArtifact={onSelectArtifact}
					/>
				</div>
			) : activePanelTab === "todos" ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<TodosPanel />
				</div>
			) : (
				// biome-ignore lint/a11y/noStaticElementInteractions: Drop zone for external file upload
				<div
					className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
					onClickCapture={handleClickCapture}
					onDragOver={drop.onDragOver}
					onDragLeave={drop.onDragLeave}
					onDrop={drop.onDrop}
				>
					<ShadowClickHint hint={filePolicy.hint} findRow={findFileRow}>
						<PierreFileTree
							model={model}
							className="flex-1 min-h-0"
							style={TREE_STYLE}
							renderContextMenu={renderContextMenu}
						/>
					</ShadowClickHint>

					{drop.dropTarget && <FilesTabDropOverlay target={drop.dropTarget} />}

					<RevealFlash rect={flashRect} onDone={() => setFlashRect(null)} />
				</div>
			)}
		</div>
	);
}
