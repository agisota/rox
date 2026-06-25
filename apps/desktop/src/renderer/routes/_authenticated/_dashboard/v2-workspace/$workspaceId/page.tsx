import { Workspace } from "@rox/panes";
import { AnimatedHeight, motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { workspaceTrpc } from "@rox/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { AddTabMenu } from "./components/AddTabMenu";
import { BackgroundTerminalsButton } from "./components/BackgroundTerminalsButton";
import { V2NotificationStatusIndicator } from "./components/V2NotificationStatusIndicator";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { V2WorkspaceRunButton } from "./components/V2WorkspaceRunButton";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceMissingWorktreeState } from "./components/WorkspaceMissingWorktreeState";
import { WorkspacePresence } from "./components/WorkspacePresence";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { WorkspaceVoiceButton } from "./components/WorkspaceVoiceButton";
import { useAgentBridge } from "./hooks/useAgentBridge";
import { useBrowserShellInteractionPassthrough } from "./hooks/useBrowserShellInteractionPassthrough";
import { useClearActivePaneAttention } from "./hooks/useClearActivePaneAttention";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { useDirtyTabCloseGuard } from "./hooks/useDirtyTabCloseGuard";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { useV2PresetExecution } from "./hooks/useV2PresetExecution";
import { useV2TerminalLauncher } from "./hooks/useV2TerminalLauncher";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useV2WorkspaceRun } from "./hooks/useV2WorkspaceRun";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { WorkspaceGitStatusProvider } from "./providers/WorkspaceGitStatusProvider";
import { FileDocumentStoreProvider } from "./state/fileDocumentStore";
import type { PaneViewerData } from "./types";
import type { V2WorkspaceUrlOpenTarget } from "./utils/openUrlInV2Workspace";
import { shouldSeedChat } from "./utils/shouldSeedChat";

interface WorkspaceSearch {
	terminalId?: string;
	chatSessionId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		terminalId: parseNonEmptyString(raw.terminalId),
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function V2WorkspacePage() {
	const { workspace } = useWorkspace();
	useAgentBridge({ workspaceId: workspace.id });
	const workspaceStatusQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspace.id },
		{
			refetchOnWindowFocus: true,
			retry: false,
		},
	);

	if (workspaceStatusQuery.data?.worktreeExists === false) {
		return (
			<WorkspaceMissingWorktreeState
				workspaceId={workspace.id}
				workspaceName={workspace.name}
				branch={workspace.branch}
				worktreePath={workspaceStatusQuery.data?.worktreePath}
				onRefresh={() => {
					void workspaceStatusQuery.refetch();
				}}
				isRefreshing={workspaceStatusQuery.isFetching}
			/>
		);
	}

	return <V2WorkspaceContent />;
}

function V2WorkspaceContent() {
	const {
		terminalId,
		chatSessionId,
		focusRequestId,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = Route.useSearch();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;

	const {
		preferences: v2UserPreferences,
		setRightSidebarOpen,
		setRightSidebarTab,
		setRightSidebarWidth,
		setShowPresetsBar,
	} = useV2UserPreferences();
	const showPresetsBar = v2UserPreferences.showPresetsBar;
	const sidebarOpen = v2UserPreferences.rightSidebarOpen;
	const { store, isLayoutHydrated, persistedPaneLayout } =
		useV2WorkspacePaneLayout();
	useClearActivePaneAttention({ store });
	const launcher = useV2TerminalLauncher();
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = useV2PresetExecution({
		store,
		launcher,
	});
	const workspaceRun = useV2WorkspaceRun({
		store,
		launcher,
		matchedPresets,
		resolvePresetCommands,
	});
	useConsumeAutomationRunLink({
		store,
		workspaceId,
		terminalId,
		chatSessionId,
		focusRequestId,
	});
	useConsumeOpenUrlRequest({
		store,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
	});

	const {
		openFilePane,
		openFilePaneFromTreeClick,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	} = useWorkspaceFileNavigation({
		store,
		setRightSidebarOpen,
		setRightSidebarTab,
	});

	const paneRegistry = usePaneRegistry({
		onOpenFile: openFilePane,
		onRevealPath: revealPath,
		launcher,
		store,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions({
		paneRegistry,
		launcher,
	});
	const {
		openDiffPane,
		addTerminalTab,
		addChatTab,
		addBrowserTab,
		openCommentPane,
	} = useWorkspacePaneOpeners({
		store,
		launcher,
		newTabPresets,
		executePreset,
	});

	// After creating a project the user lands in an empty main-workspace.
	// Open one empty chat tab instead of the chooser — once per workspace, only
	// after the persisted layout has hydrated and is genuinely empty.
	const seededWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!isLayoutHydrated) return; // wait for strict readiness (no cache-first)
		if (seededWorkspaceIdRef.current === workspaceId) return; // idempotent
		if (!shouldSeedChat(persistedPaneLayout)) {
			// Not empty (or already has tabs): mark handled so later layout edits
			// don't re-trigger the seed.
			seededWorkspaceIdRef.current = workspaceId;
			return;
		}
		// Double-guard against a race: re-check the live store before writing.
		if (store.getState().tabs.length > 0) {
			seededWorkspaceIdRef.current = workspaceId;
			return;
		}
		seededWorkspaceIdRef.current = workspaceId;
		addChatTab();
	}, [isLayoutHydrated, persistedPaneLayout, workspaceId, store, addChatTab]);

	const quickOpenOpen = useQuickOpenStore(
		(s) => s.open && s.target?.workspaceId === workspaceId,
	);
	const closeQuickOpen = useQuickOpenStore((s) => s.close);
	const openQuickOpenFor = useQuickOpenStore((s) => s.openFor);
	const handleQuickOpen = useCallback(
		() => openQuickOpenFor({ workspaceId }),
		[openQuickOpenFor, workspaceId],
	);
	const handleQuickOpenChange = useCallback(
		(next: boolean) => {
			if (!next) closeQuickOpen();
		},
		[closeQuickOpen],
	);
	// Picking a file from Quick Open should surface the sidebar/Files tab so
	// the reveal (expand + highlight + scroll) is actually visible. Tree
	// clicks and other openFilePane callers already have the sidebar open.
	const handleQuickOpenSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			setRightSidebarOpen(true);
			setRightSidebarTab("files");
			openFilePane(filePath, openInNewTab);
		},
		[openFilePane, setRightSidebarOpen, setRightSidebarTab],
	);
	const defaultPaneActions = useDefaultPaneActions({ launcher, workspaceId });
	const onBeforeCloseTab = useDirtyTabCloseGuard();

	// Fallback for rows persisted before the rightSidebarWidth field existed —
	// the live collection skips zod defaults, so an older row reads undefined
	// here and would render the ResizablePanel without a width (full-bleed).
	const sidebarWidth = v2UserPreferences.rightSidebarWidth ?? 340;
	const [isSidebarResizing, setIsSidebarResizing] = useState(false);
	const { onSidebarResizeDragging, onWorkspaceInteractionStateChange } =
		useBrowserShellInteractionPassthrough({ sidebarOpen });
	const handleSidebarResizingChange = useCallback(
		(resizing: boolean) => {
			setIsSidebarResizing(resizing);
			onSidebarResizeDragging(resizing);
		},
		[onSidebarResizeDragging],
	);
	// Gate the right-sidebar presence transition on the user's motion preference
	// (reduced motion / Off collapses it to an instant opacity swap).
	const shouldAnimate = useShouldAnimate("essential");

	// The sidebar slot lives at the dashboard layout level (next to TopBar) so
	// the sidebar runs full-height. The slot is mounted by the parent layout
	// before this child renders, so look it up synchronously during state init —
	// otherwise users with rightSidebarOpen=true persisted see a 1-frame flash
	// while the post-mount effect fills the ref.
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(() =>
		typeof document !== "undefined"
			? document.getElementById("workspace-right-sidebar-slot")
			: null,
	);
	useEffect(() => {
		if (sidebarSlotEl) return;
		setSidebarSlotEl(document.getElementById("workspace-right-sidebar-slot"));
	}, [sidebarSlotEl]);

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		addTerminalTab,
		paneRegistry,
		launcher,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const workspaceRunButton = (
		<V2WorkspaceRunButton
			projectId={workspace.projectId}
			definition={workspaceRun.definition}
			isRunning={workspaceRun.isRunning}
			isPending={workspaceRun.isPending}
			canForceStop={workspaceRun.canForceStop}
			onToggle={workspaceRun.toggleWorkspaceRun}
			onForceStop={workspaceRun.forceStopWorkspaceRun}
		/>
	);

	return (
		// LayoutGroup gives the Quick Open exit-flourish and the (portalled) file
		// pane a single, consistent `layoutId` namespace for the open-file shared
		// transition (case 047). It only provides layout context — panes carry no
		// `layoutId` children, so the virtualized/DnD pane tree is unaffected.
		<LayoutGroup id="quickopen-file-transition">
			<FileDocumentStoreProvider>
				<WorkspaceGitStatusProvider
					workspaceId={workspaceId}
					store={store}
					sidebarOpen={sidebarOpen}
				>
					<div className="flex min-h-0 min-w-0 flex-1">
						<div
							className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden"
							data-workspace-id={workspaceId}
						>
							<Workspace<PaneViewerData>
								key={workspaceId}
								registry={paneRegistry}
								paneActions={defaultPaneActions}
								contextMenuActions={defaultContextMenuActions}
								renderTabIcon={renderBrowserTabIcon}
								renderTabAccessory={(tab) => (
									<V2NotificationStatusIndicator
										sources={getV2NotificationSourcesForTab(tab)}
									/>
								)}
								renderBelowTabBar={() => (
									<div className="flex min-w-0 flex-col">
										<AnimatedHeight open={showPresetsBar}>
											<V2PresetsBar
												matchedPresets={matchedPresets}
												executePreset={executePreset}
												showPresetsBar={showPresetsBar}
												onToggleShowPresetsBar={setShowPresetsBar}
											/>
										</AnimatedHeight>
										<div className="flex h-8 min-w-0 shrink-0 items-center justify-end gap-2 border-b border-border bg-background px-2">
											<WorkspacePresence workspaceId={workspaceId} />
											<WorkspaceVoiceButton workspaceId={workspaceId} />
											{workspaceRunButton}
										</div>
									</div>
								)}
								renderAddTabMenu={() => (
									<AddTabMenu
										onAddTerminal={addTerminalTab}
										onAddChat={addChatTab}
										onAddBrowser={addBrowserTab}
										showPresetsBar={showPresetsBar}
										onToggleShowPresetsBar={setShowPresetsBar}
									/>
								)}
								renderTabBarTrailing={() => (
									<BackgroundTerminalsButton
										workspaceId={workspaceId}
										store={store}
									/>
								)}
								renderEmptyState={() => (
									<WorkspaceEmptyState
										onOpenBrowser={addBrowserTab}
										onOpenChat={addChatTab}
										onOpenQuickOpen={handleQuickOpen}
										onOpenTerminal={addTerminalTab}
									/>
								)}
								onBeforeCloseTab={onBeforeCloseTab}
								onInteractionStateChange={onWorkspaceInteractionStateChange}
								store={store}
							/>
						</div>
					</div>
					{sidebarSlotEl &&
						createPortal(
							// AnimatePresence stays mounted inside the persistent slot so the
							// right sidebar can play its exit animation; `sidebarOpen` gates the
							// motion child rather than the portal itself.
							<AnimatePresence initial={false}>
								{sidebarOpen && (
									<motion.div
										key="right-sidebar"
										className="flex h-full shrink-0"
										initial={shouldAnimate ? { x: "100%", opacity: 0 } : false}
										animate={{ x: 0, opacity: 1 }}
										exit={
											shouldAnimate ? { x: "100%", opacity: 0 } : { opacity: 0 }
										}
										transition={
											shouldAnimate ? motionSpring.panel : { duration: 0 }
										}
									>
										<ResizablePanel
											width={sidebarWidth}
											onWidthChange={setRightSidebarWidth}
											isResizing={isSidebarResizing}
											onResizingChange={handleSidebarResizingChange}
											minWidth={240}
											maxWidth={640}
											handleSide="left"
											onDoubleClickHandle={() => setRightSidebarWidth(340)}
										>
											<WorkspaceSidebar
												workspaceId={workspaceId}
												onSelectFile={openFilePaneFromTreeClick}
												onSelectDiffFile={openDiffPane}
												onOpenComment={openCommentPane}
												onOpenChat={addChatTab}
												onSearch={handleQuickOpen}
												selectedFilePath={selectedFilePath}
												pendingReveal={pendingReveal}
											/>
										</ResizablePanel>
									</motion.div>
								)}
							</AnimatePresence>,
							sidebarSlotEl,
						)}
				</WorkspaceGitStatusProvider>
				<CommandPalette
					workspaceId={workspaceId}
					open={quickOpenOpen}
					onOpenChange={handleQuickOpenChange}
					onSelectFile={handleQuickOpenSelectFile}
					variant="v2"
					recentlyViewedFiles={recentFiles}
					openFilePaths={openFilePaths}
				/>
			</FileDocumentStoreProvider>
		</LayoutGroup>
	);
}
