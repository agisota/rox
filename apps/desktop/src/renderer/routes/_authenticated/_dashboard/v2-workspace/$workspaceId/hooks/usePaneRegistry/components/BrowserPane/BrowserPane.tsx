import type { RendererContext, Tab } from "@rox/panes";
import { BrowserFullscreenPreview, BrowserLoadingBar } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { GlobeIcon } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { TbDeviceDesktop, TbPointer } from "react-icons/tb";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { BrowserPaneData, PaneViewerData } from "../../../../types";
import { browserRuntimeRegistry } from "./browserRuntimeRegistry";
import { BrowserErrorOverlay } from "./components/BrowserErrorOverlay";
import { BrowserOverflowMenu } from "./components/BrowserOverflowMenu";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { DesignModeCapturePreview } from "./components/DesignModeCapturePreview";
import { DevicePresetSelect } from "./components/DevicePresetSelect";
import { useDesignMode } from "./hooks/useDesignMode";
import { usePersistentWebview } from "./hooks/usePersistentWebview";

// Module-level per-pane fullscreen state so BrowserPane (content) and
// BrowserPaneToolbar (toolbar) share the same boolean without prop-drilling.
const _fsMap = new Map<string, boolean>();
const _fsSubs = new Map<string, Set<() => void>>();

function _getFSState(paneId: string): boolean {
	return _fsMap.get(paneId) ?? false;
}
function _setFSState(paneId: string, value: boolean): void {
	_fsMap.set(paneId, value);
	_fsSubs.get(paneId)?.forEach((cb) => {
		cb();
	});
}
function _subFSState(paneId: string, cb: () => void): () => void {
	let subs = _fsSubs.get(paneId);
	if (!subs) {
		subs = new Set();
		_fsSubs.set(paneId, subs);
	}
	subs.add(cb);
	return () => {
		_fsSubs.get(paneId)?.delete(cb);
	};
}

function useFullscreenState(paneId: string) {
	const isFullscreen = useSyncExternalStore(
		useCallback((cb) => _subFSState(paneId, cb), [paneId]),
		useCallback(() => _getFSState(paneId), [paneId]),
	);
	const toggle = useCallback(
		() => _setFSState(paneId, !_getFSState(paneId)),
		[paneId],
	);
	const exit = useCallback(() => _setFSState(paneId, false), [paneId]);
	return { isFullscreen, toggle, exit };
}

function getSingleBrowserPane(
	tab: Tab<PaneViewerData>,
): { id: string; data: BrowserPaneData } | null {
	const paneIds = Object.keys(tab.panes);
	if (paneIds.length !== 1) return null;
	const pane = tab.panes[paneIds[0]];
	if (pane.kind !== "browser") return null;
	return { id: pane.id, data: pane.data as BrowserPaneData };
}

export function renderBrowserTabIcon(tab: Tab<PaneViewerData>) {
	const browser = getSingleBrowserPane(tab);
	if (!browser?.data.faviconUrl) return null;
	return (
		<img src={browser.data.faviconUrl} alt="" className="size-3.5 shrink-0" />
	);
}

interface BrowserPaneProps {
	ctx: RendererContext<PaneViewerData>;
}

function useBrowserState(paneId: string) {
	return useSyncExternalStore(
		useCallback(
			(cb) => browserRuntimeRegistry.onStateChange(paneId, cb),
			[paneId],
		),
		useCallback(() => browserRuntimeRegistry.getState(paneId), [paneId]),
	);
}

export function BrowserPane({ ctx }: BrowserPaneProps) {
	const paneId = ctx.pane.id;
	const state = useBrowserState(paneId);
	const { placeholderRef, reload } = usePersistentWebview({ paneId, ctx });
	const { isFullscreen, exit } = useFullscreenState(paneId);

	const isBlankPage = !state.currentUrl || state.currentUrl === "about:blank";

	return (
		<BrowserFullscreenPreview
			isFullscreen={isFullscreen}
			onExit={exit}
			paneId={paneId}
			className="relative flex flex-1 h-full"
		>
			<BrowserLoadingBar loading={state.isLoading} />
			<div ref={placeholderRef} className="w-full h-full" style={{ flex: 1 }} />
			{state.error && !state.isLoading && (
				<BrowserErrorOverlay error={state.error} onRetry={reload} />
			)}
			{isBlankPage && !state.isLoading && !state.error && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background pointer-events-none">
					<GlobeIcon className="size-10 text-muted-foreground/30" />
					<div className="text-center">
						<p className="text-sm font-medium text-muted-foreground/50">
							Browser
						</p>
						<p className="mt-1 text-xs text-muted-foreground/30">
							Enter a URL above, or instruct an agent to navigate
							<br />
							and use the browser
						</p>
					</div>
				</div>
			)}
		</BrowserFullscreenPreview>
	);
}

interface BrowserPaneToolbarProps {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function BrowserPaneToolbar({
	ctx,
	workspaceId,
}: BrowserPaneToolbarProps) {
	const paneId = ctx.pane.id;
	const state = useBrowserState(paneId);
	const { isFullscreen, toggle } = useFullscreenState(paneId);
	const designMode = useDesignMode({ paneId, workspaceId, ctx });

	const handleOpenDevTools = useCallback(() => {
		electronTrpcClient.browser.openDevTools.mutate({ paneId }).catch(() => {});
	}, [paneId]);

	const handleGoBack = useCallback(() => {
		browserRuntimeRegistry.goBack(paneId);
	}, [paneId]);

	const handleGoForward = useCallback(() => {
		browserRuntimeRegistry.goForward(paneId);
	}, [paneId]);

	const handleReload = useCallback(() => {
		browserRuntimeRegistry.reload(paneId);
	}, [paneId]);

	const handleNavigate = useCallback(
		(url: string) => {
			browserRuntimeRegistry.navigate(paneId, url);
		},
		[paneId],
	);

	const isBlankPage = !state.currentUrl || state.currentUrl === "about:blank";
	const PaneHeaderActions = ctx.components.PaneHeaderActions;

	return (
		<div className="flex h-full w-full min-w-0 items-center justify-between">
			<BrowserToolbar
				currentUrl={state.currentUrl}
				pageTitle={state.pageTitle}
				isLoading={state.isLoading}
				canGoBack={state.canGoBack}
				canGoForward={state.canGoForward}
				onGoBack={handleGoBack}
				onGoForward={handleGoForward}
				onReload={handleReload}
				onNavigate={handleNavigate}
			/>
			<div className="relative flex shrink-0 items-center pr-1">
				<div className="mx-1.5 h-3.5 w-px bg-muted-foreground/60" />
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => {
								void designMode.setEnabled(!designMode.enabled);
							}}
							className={`rounded p-0.5 transition-colors ${designMode.enabled ? "bg-primary/15 text-primary" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
						>
							<TbPointer className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{designMode.enabled ? "Disable Design Mode" : "Design Mode"}
					</TooltipContent>
				</Tooltip>
				<DevicePresetSelect
					presetId={designMode.presetId}
					onSelect={(id) => {
						void designMode.setPreset(id);
					}}
				/>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenDevTools}
							className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							<TbDeviceDesktop className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Open DevTools
					</TooltipContent>
				</Tooltip>
				{designMode.capture && (
					<DesignModeCapturePreview
						capture={designMode.capture}
						capturing={designMode.capturing}
						workspaceId={designMode.workspaceId}
						browserSessionId={designMode.browserSessionId}
						onDismiss={designMode.dismissCapture}
					/>
				)}
				<BrowserOverflowMenu
					paneId={paneId}
					currentUrl={state.currentUrl}
					hasPage={!isBlankPage}
					isFullscreen={isFullscreen}
					onToggleFullscreen={toggle}
				/>
				<div className="mx-1 h-3.5 w-px bg-muted-foreground/60" />
				<PaneHeaderActions />
			</div>
		</div>
	);
}
