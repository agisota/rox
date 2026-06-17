import type {
	CodeViewItem,
	DiffLineAnnotation,
	LineAnnotation,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import type { RendererContext } from "@rox/panes";
import {
	DiffSkeleton,
	ease,
	FocusMarker,
	motionDuration,
	useDiffFlash,
	useShouldAnimate,
} from "@rox/ui/motion";
import { motion } from "framer-motion";
import { useCallback, useMemo, useRef } from "react";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { type ChangesetFile, useChangeset } from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import { AgentCommentComposer } from "./components/AgentCommentComposer";
import { CommentThread } from "./components/CommentThread";
import { DiffEmptyState } from "./components/DiffEmptyState";
import { DiffHeaderMetadata } from "./components/DiffHeaderMetadata";
import { DiffHeaderPrefix } from "./components/DiffHeaderPrefix";
import {
	type DiffAnnotationMetadata,
	useDiffAnnotationsByPath,
} from "./hooks/useDiffAnnotations";
import { useDiffCodeViewItems } from "./hooks/useDiffCodeViewItems";
import { useDiffCodeViewScroll } from "./hooks/useDiffCodeViewScroll";
import { useDiffCodeViewTheme } from "./hooks/useDiffCodeViewTheme";
import { useDiffCommentComposer } from "./hooks/useDiffCommentComposer";

interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
}

interface DiffPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onCreateNewAgentSession?: (
		input: CreateNewAgentSessionInput,
	) => Promise<{ terminalId: string } | null>;
}

export function DiffPane({
	context,
	workspaceId,
	onOpenFile,
	onCreateNewAgentSession,
}: DiffPaneProps) {
	const data = context.pane.data as DiffPaneData;
	const codeViewRef = useRef<CodeViewHandle<DiffAnnotationMetadata>>(null);

	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({ workspaceId, ref });
	const { viewedSet, setViewed } = useViewedFiles(workspaceId);
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const threadAnnotationsByPath = useDiffAnnotationsByPath({ workspaceId });

	const collapsedSet = useMemo(
		() => new Set(data.collapsedFiles ?? []),
		[data.collapsedFiles],
	);

	const dataRef = useRef(data);
	dataRef.current = data;
	const updateData = context.actions.updateData;
	const setCollapsed = useCallback(
		(path: string, value: boolean) => {
			const current = dataRef.current;
			const collapsed = current.collapsedFiles ?? [];
			const has = collapsed.includes(path);
			if (value === has) return;
			const next = value
				? [...collapsed, path]
				: collapsed.filter((p) => p !== path);
			updateData({ ...current, collapsedFiles: next } as PaneViewerData);
		},
		[updateData],
	);

	// fileByItemId is produced by useDiffCodeViewItems below, but the composer
	// hook needs access to look files up at submit time. Funnel through a
	// stable ref so the composer hook can be wired before items are computed
	// and still read the latest map when its submit callback fires.
	const fileByItemIdRef = useRef<ReadonlyMap<string, ChangesetFile>>(new Map());
	const getFile = useCallback(
		(itemId: string) => fileByItemIdRef.current.get(itemId),
		[],
	);

	const {
		composerAnnotationsByItemId,
		onLineSelectionEnd,
		onGutterUtilityClick,
		clear: clearComposer,
		submit: submitComposer,
	} = useDiffCommentComposer({
		workspaceId,
		codeViewRef,
		getFile,
		onCreateNewAgentSession,
	});

	const { items, fileByItemId, pathToItemId, hasPendingDiff, hasDiffError } =
		useDiffCodeViewItems({
			workspaceId,
			files,
			collapsedSet,
			annotationsByPath: threadAnnotationsByPath,
			extraAnnotationsByItemId: composerAnnotationsByItemId,
		});
	fileByItemIdRef.current = fileByItemId;

	const { targetItemId, focusSignature } = useDiffCodeViewScroll({
		codeViewRef,
		data,
		fileByItemId,
		pathToItemId,
		items,
		collapsedSet,
		setCollapsed,
	});

	const { options, style } = useDiffCodeViewTheme();
	const shouldAnimate = useShouldAnimate("decorative");

	const codeViewOptions = useMemo(
		() => ({
			...options,
			enableLineSelection: true,
			enableGutterUtility: true,
			onGutterUtilityClick,
			onLineSelectionEnd,
		}),
		[options, onGutterUtilityClick, onLineSelectionEnd],
	);

	// Case 084: stable key derived from the changeset identity — re-arms the
	// flash when the diff content changes, not on every render.
	const flashKey = useMemo(() => items.map((i) => i.id).join("|"), [items]);
	const { flashClass } = useDiffFlash(flashKey);

	const renderHeaderPrefix = useCallback(
		(item: CodeViewItem<DiffAnnotationMetadata>) => {
			const file = fileByItemId.get(item.id);
			if (!file) return null;
			return (
				<DiffHeaderPrefix
					file={file}
					collapsed={collapsedSet.has(file.path)}
					onSetCollapsed={setCollapsed}
				/>
			);
		},
		[fileByItemId, collapsedSet, setCollapsed],
	);

	const renderHeaderMetadata = useCallback(
		(item: CodeViewItem<DiffAnnotationMetadata>) => {
			const file = fileByItemId.get(item.id);
			if (!file) return null;
			return (
				<DiffHeaderMetadata
					file={file}
					workspaceId={workspaceId}
					onSetCollapsed={setCollapsed}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
					onOpenFile={onOpenFile}
					onOpenInExternalEditor={openInExternalEditor}
				/>
			);
		},
		[
			fileByItemId,
			workspaceId,
			setCollapsed,
			viewedSet,
			setViewed,
			onOpenFile,
			openInExternalEditor,
		],
	);

	const renderAnnotation = useCallback(
		(
			annotation:
				| LineAnnotation<DiffAnnotationMetadata>
				| DiffLineAnnotation<DiffAnnotationMetadata>,
			item: CodeViewItem<DiffAnnotationMetadata>,
		) => {
			if (item.type !== "diff") return null;
			const m = annotation.metadata;
			if (m.kind === "composer") {
				return (
					<AgentCommentComposer
						workspaceId={workspaceId}
						startLine={m.startLine}
						endLine={m.endLine}
						onCancel={clearComposer}
						onSubmit={submitComposer}
					/>
				);
			}
			const annotationSide = "side" in annotation ? annotation.side : undefined;
			const focused =
				item.id === targetItemId &&
				data.focusLine != null &&
				annotation.lineNumber === data.focusLine &&
				(data.focusSide == null || annotationSide === data.focusSide);

			return (
				<div className="relative">
					{focused && <FocusMarker signature={focusSignature} />}
					<CommentThread
						workspaceId={workspaceId}
						threadId={m.threadId}
						isResolved={m.isResolved}
						isOutdated={m.isOutdated}
						url={m.url}
						comments={m.comments}
						focusTick={focused ? data.focusTick : undefined}
					/>
				</div>
			);
		},
		[
			workspaceId,
			targetItemId,
			focusSignature,
			data.focusLine,
			data.focusSide,
			data.focusTick,
			clearComposer,
			submitComposer,
		],
	);

	if (files.length === 0) {
		if (isLoading) {
			return <DiffSkeleton className="h-full w-full" />;
		}
		return <DiffEmptyState />;
	}

	if (items.length === 0) {
		if (hasPendingDiff) {
			return <DiffSkeleton className="h-full w-full" />;
		}
		if (hasDiffError) {
			return (
				<motion.div
					className="flex h-full w-full cursor-text select-text items-center justify-center text-sm text-muted-foreground"
					initial={shouldAnimate ? { opacity: 0 } : false}
					animate={{ opacity: 1 }}
					transition={{ duration: motionDuration.base, ease: ease.standard }}
				>
					Unable to load diff
				</motion.div>
			);
		}
		return null;
	}

	return (
		<CodeView<DiffAnnotationMetadata>
			ref={codeViewRef}
			className={`h-full w-full overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none] ${flashClass}`.trim()}
			style={style}
			items={items}
			options={codeViewOptions}
			renderHeaderPrefix={renderHeaderPrefix}
			renderHeaderMetadata={renderHeaderMetadata}
			renderAnnotation={renderAnnotation}
		/>
	);
}
