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
import { RevealFlash, useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { workspaceTrpc } from "@rox/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import {
	FilePlus,
	FolderPlus,
	FoldVertical,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGitStatusMap } from "renderer/hooks/host-service/useGitStatusMap";
import {
	ShadowClickHint,
	usePierreRowClickPolicy,
	useSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import { useFallthroughIcons } from "renderer/lib/fileIcons";
import { createPierreTreeStyle } from "renderer/lib/pierreTree";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { PierreRowContextMenu } from "../PierreRowContextMenu";
import { FileMenuItems } from "./components/FileMenuItems";
import { FilesTabDropOverlay } from "./components/FilesTabDropOverlay";
import { FilesTabHeaderButton } from "./components/FilesTabHeaderButton";
import { FolderMenuItems } from "./components/FolderMenuItems";
import {
	FILE_EXPLORER_INDENT,
	FILE_EXPLORER_OVERSCAN,
	FILE_EXPLORER_ROW_HEIGHT,
} from "./constants";
import { useFilesTabActions } from "./hooks/useFilesTabActions";
import { useFilesTabBridge } from "./hooks/useFilesTabBridge";
import { useFilesTabDrop } from "./hooks/useFilesTabDrop";
import { useFileTreeSizes } from "./hooks/useFileTreeSizes";
import { buildPierreGitStatus } from "./utils/buildPierreGitStatus";
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

interface FilesTabProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	selectedFilePath?: string;
	pendingReveal?: {
		path: string;
		isDirectory: boolean;
	} | null;
	workspaceId: string;
	gitStatus: GitStatusData | undefined;
}

export function FilesTab({
	onSelectFile,
	selectedFilePath,
	pendingReveal,
	workspaceId,
	gitStatus,
}: FilesTabProps) {
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const rootPath = workspaceQuery.data?.worktreePath ?? "";

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

	const bridge = useFilesTabBridge({ model, workspaceId, rootPath });

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
	// Surface the file size (F31) in Pierre's right-aligned decoration lane.
	// Folders show no size; files show a human-readable size once `getMetadata`
	// has resolved it (the lane stays empty until then). The git-status row tint
	// is independent — Pierre paints it via `setGitStatus`, not this lane.
	handlersRef.current.renderRowDecoration = (ctx) => {
		if (ctx.item.kind === "directory") return null;
		const size = sizes.getSize(ctx.item.path);
		if (size == null) return null;
		const text = formatFileSize(size);
		return { text, title: `${size.toLocaleString()} B` };
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

	if (!rootPath) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				{workspaceQuery.isLoading ? (
					<>
						<Loader2 className="size-3.5 animate-spin" />
						<span>Загрузка файлов...</span>
					</>
				) : (
					"Workspace worktree not available"
				)}
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Drop zone for external file upload
		<div
			className="relative flex h-full min-h-0 flex-col overflow-hidden"
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
					header={
						<div className="group flex h-6 items-center justify-end bg-background px-2 text-muted-foreground">
							<div className="flex items-center gap-0.5">
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
									icon={FoldVertical}
									label="Свернуть всё"
									onClick={collapseAll}
								/>
							</div>
						</div>
					}
					renderContextMenu={renderContextMenu}
				/>
			</ShadowClickHint>

			{drop.dropTarget && <FilesTabDropOverlay target={drop.dropTarget} />}

			<RevealFlash rect={flashRect} onDone={() => setFlashRect(null)} />
		</div>
	);
}
