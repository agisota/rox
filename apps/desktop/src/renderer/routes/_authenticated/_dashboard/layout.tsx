import { useCascadeRules } from "@rox/ui/hooks/use-breakpoint";
import { useZenMode } from "@rox/ui/hooks/use-zen-mode";
import {
	RouteTransition,
	shellBootVariants,
	useShouldAnimate,
	zenDensity,
	zenSceneTransition,
} from "@rox/ui/motion";
import { ShellSidebarRegion } from "@rox/ui/shell-sidebar-region";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { CommandPaletteHost } from "renderer/commandPalette";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { DashboardSidebarDeleteDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDevSeedV2Sidebar } from "renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { CrossVersionMismatchState } from "./components/CrossVersionMismatchState";
import { GithubConnectBanner } from "./components/GithubConnectBanner";
import { TopBar } from "./components/TopBar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

type DeleteTarget =
	| {
			version: "v1";
			workspaceId: string;
			workspaceName: string;
			workspaceType: "worktree" | "branch";
	  }
	| {
			version: "v2";
			workspaceId: string;
			workspaceName: string;
			open: boolean;
	  };

function DashboardLayout() {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const collections = useCollections();
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();
	useDevSeedV2Sidebar();
	// Case 002 / PR-02: one-shot first-mount entrance for the shell columns.
	const shouldAnimate = useShouldAnimate("decorative");
	// Case 056 / PR-56 (#649): shell-level Focus / Zen mode. The on/off state
	// lives in the platform-neutral `@rox/shared/zen-mode` store; while active we
	// collapse the side rails, expand the canvas, and dim the surrounding chrome.
	const { isZen, toggleZen } = useZenMode();
	const chromeOpacity = isZen ? zenDensity.chromeDim : zenDensity.chromeRest;
	// Case 005 / PR-05 (#639): shell-level responsive cascade. The viewport tier
	// (wide / tablet / phone) and its per-region collapse rules come from the
	// shared `@rox/shared/breakpoints` core via `useCascadeRules`; the same
	// contract drives web and mobile. On the phone tier the left sidebar collapses
	// from an in-flow rail to a hamburger + slide-in drawer, and the right context
	// slot switches from docked to a slide-over — the right-panel consumer reads
	// the tier off the slot's `data-right-panel`. The center column reflows in
	// place: same DOM tree, no separate mobile render.
	const cascade = useCascadeRules();
	const sidebarAsDrawer = cascade.sidebar === "drawer";
	// Case 003 / PR-03: key the route transition on the TOP-LEVEL path segment
	// only (e.g. `/v2-workspace`), never the full pathname — keying by params
	// would remount the entire panes subtree on every workspace switch.
	const location = useLocation();
	const routeKey = `/${location.pathname.split("/")[1] ?? ""}`;
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;
	const v2WorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentV2WorkspaceId =
		v2WorkspaceMatch !== false ? v2WorkspaceMatch.workspaceId : null;
	const onV1WorkspaceRoute = currentWorkspaceMatch !== false;
	const onV2WorkspaceRoute = v2WorkspaceMatch !== false;
	const versionMismatch =
		(isV2CloudEnabled && onV1WorkspaceRoute) ||
		(!isV2CloudEnabled && onV2WorkspaceRoute);

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const { data: currentV2Workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) =>
					eq(workspaces.id, currentV2WorkspaceId ?? ""),
				),
		[collections, currentV2WorkspaceId],
	);
	const currentV2Workspace =
		currentV2WorkspaceId != null ? (currentV2Workspaces[0] ?? null) : null;

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useHotkey("OPEN_SETTINGS", () => navigate({ to: "/settings/account" }));
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }));
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", () => {
		if (!isWorkspaceSidebarOpen) {
			setWorkspaceSidebarOpen(true);
		} else {
			toggleWorkspaceSidebarCollapsed();
		}
	});
	useHotkey("NEW_WORKSPACE", () =>
		openNewWorkspaceModal(currentWorkspace?.projectId),
	);
	useHotkey("TOGGLE_ZEN_MODE", () => toggleZen());

	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (currentWorkspaceId && currentWorkspace) {
				setDeleteTarget({
					workspaceId: currentWorkspaceId,
					workspaceName: currentWorkspace.name,
					workspaceType: currentWorkspace.type,
					version: "v1",
				});
				return;
			}

			if (
				currentV2WorkspaceId &&
				currentV2Workspace &&
				currentV2Workspace.type !== "main"
			) {
				setDeleteTarget({
					workspaceId: currentV2WorkspaceId,
					workspaceName: currentV2Workspace.name || currentV2Workspace.branch,
					version: "v2",
					open: true,
				});
			}
		},
		{
			enabled:
				(!!currentWorkspaceId && !!currentWorkspace) ||
				(!!currentV2WorkspaceId &&
					!!currentV2Workspace &&
					currentV2Workspace.type !== "main"),
		},
	);

	// The logical sidebar body, shared verbatim between the docked rail and the
	// phone drawer so the two presentations can never diverge (#639). On the
	// drawer tier we never collapse the body — the drawer is already a compact
	// overlay — so it always renders expanded there.
	const sidebarContent = isV2CloudEnabled ? (
		<DashboardSidebar
			isCollapsed={!sidebarAsDrawer && isWorkspaceSidebarCollapsed()}
		/>
	) : (
		<WorkspaceSidebar
			isCollapsed={!sidebarAsDrawer && isWorkspaceSidebarCollapsed()}
			activeProjectId={currentWorkspace?.projectId ?? null}
			activeProjectName={currentWorkspace?.project?.name ?? null}
		/>
	);

	// Zen mode collapses the side rail entirely so the canvas takes the full
	// width; toggling back restores the prior sidebar state untouched. The docked
	// rail is the wide/tablet presentation; on phone the same content moves into
	// `ShellSidebarRegion`'s slide-in drawer (rail → hamburger).
	const dockedSidebar = (
		<motion.div
			className="flex h-full shrink-0"
			variants={shouldAnimate ? shellBootVariants.sidebar : undefined}
		>
			<ResizablePanel
				width={workspaceSidebarWidth}
				onWidthChange={setWorkspaceSidebarWidth}
				isResizing={isWorkspaceSidebarResizing}
				onResizingChange={setWorkspaceSidebarIsResizing}
				minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
				maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
				handleSide="right"
				clampWidth={false}
				onDoubleClickHandle={() =>
					setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
				}
			>
				{sidebarContent}
			</ResizablePanel>
		</motion.div>
	);

	// Wide/tablet: docked rail, gated on the open + non-zen state as before.
	// Phone: the hamburger + drawer always mount (so the user can summon nav even
	// when the rail would be "closed"), but zen still suppresses the region.
	const sidebarPanel = !isZen &&
		(sidebarAsDrawer || isWorkspaceSidebarOpen) && (
			<ShellSidebarRegion
				asDrawer={sidebarAsDrawer}
				dockedSidebar={isWorkspaceSidebarOpen ? dockedSidebar : null}
				drawerOpen={isWorkspaceSidebarOpen}
				onDrawerOpenChange={setWorkspaceSidebarOpen}
			>
				{sidebarContent}
			</ShellSidebarRegion>
		);

	// Only lift the sidebar out of the TopBar column when v2 + expanded.
	// Collapsed/closed sidebars stay inside so the TopBar runs full-width.
	// On the phone tier the sidebar is a portaled drawer, never an in-flow
	// column, so it can never be "outside the column" — keep the TopBar
	// full-width there.
	const sidebarOutsideColumn =
		!sidebarAsDrawer &&
		isV2CloudEnabled &&
		isWorkspaceSidebarOpen &&
		!isWorkspaceSidebarCollapsed() &&
		!isZen;

	return (
		<motion.div
			className="flex h-full w-full overflow-hidden"
			variants={shouldAnimate ? shellBootVariants.container : undefined}
			initial={shouldAnimate ? "hidden" : false}
			animate={shouldAnimate ? "show" : false}
		>
			<CommandPaletteHost />
			{sidebarOutsideColumn && sidebarPanel}
			<motion.div
				className="flex flex-1 flex-col min-w-0 min-h-0"
				variants={shouldAnimate ? shellBootVariants.column : undefined}
			>
				{/* Zen mode dims the chrome (top bar) toward the canvas. Animate
				    when motion is allowed; otherwise snap to the target opacity. */}
				<motion.div
					animate={{ opacity: chromeOpacity }}
					initial={false}
					transition={shouldAnimate ? zenSceneTransition : { duration: 0 }}
				>
					<TopBar />
				</motion.div>
				<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
					{!sidebarOutsideColumn && sidebarPanel}
					<RouteTransition
						transitionKey={versionMismatch ? "mismatch" : routeKey}
					>
						{versionMismatch ? <CrossVersionMismatchState /> : <Outlet />}
					</RouteTransition>
				</div>
			</motion.div>
			{/* Right context region of the cascade (#639). The slot stays in the
			    DOM at every tier; the right-panel consumer reflows its docking by
			    reading `data-right-panel` — `docked` (wide), `overlay` (tablet),
			    `slide-over` (phone) — off the shared cascade rules. */}
			<div
				id="workspace-right-sidebar-slot"
				data-tier={cascade.tier}
				data-right-panel={cascade.rightPanel}
				className="flex h-full shrink-0"
			/>
			<AddRepositoryModals />
			<GithubConnectBanner />
			{deleteTarget?.version === "v1" && (
				<DeleteWorkspaceDialog
					workspaceId={deleteTarget.workspaceId}
					workspaceName={deleteTarget.workspaceName}
					workspaceType={deleteTarget.workspaceType}
					open={true}
					onOpenChange={(open) => {
						if (!open) setDeleteTarget(null);
					}}
				/>
			)}
			{deleteTarget?.version === "v2" && (
				<DashboardSidebarDeleteDialog
					workspaceId={deleteTarget.workspaceId}
					workspaceName={deleteTarget.workspaceName}
					open={deleteTarget.open}
					onOpenChange={(open) => {
						setDeleteTarget((target) =>
							target?.version === "v2" ? { ...target, open } : target,
						);
					}}
					onDeleted={() => {
						removeWorkspaceFromSidebar(deleteTarget.workspaceId);
						setDeleteTarget(null);
					}}
				/>
			)}
		</motion.div>
	);
}
