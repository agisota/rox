import type { RendererContext } from "@rox/panes";
import { toast } from "@rox/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	BrowserPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { DesignModeCapture, DesignModeEvent } from "shared/browser";
import { DEFAULT_DEVICE_PRESET_ID } from "shared/browser";

interface UseDesignModeOptions {
	paneId: string;
	workspaceId: string;
	ctx: RendererContext<PaneViewerData>;
}

/**
 * Renderer-side controller for Design Mode + device presets on a Browser pane.
 * Toggles the in-page picker, listens for selection events, drives element
 * capture, and persists `designModeEnabled` / `devicePresetId` to pane data.
 */
export function useDesignMode({
	paneId,
	workspaceId,
	ctx,
}: UseDesignModeOptions) {
	const ctxRef = useRef(ctx);
	ctxRef.current = ctx;

	const data = ctx.pane.data as BrowserPaneData;
	const enabled = data.designModeEnabled ?? false;
	const presetId = data.devicePresetId ?? DEFAULT_DEVICE_PRESET_ID;

	const [capture, setCapture] = useState<DesignModeCapture | null>(null);
	const [capturing, setCapturing] = useState(false);

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);
	const workspaceRoot = workspace?.worktreePath || undefined;

	// Read inside the subscription's onData via refs so the subscription effect
	// doesn't tear down/recreate when these settle (which could drop a click).
	const workspaceRootRef = useRef(workspaceRoot);
	workspaceRootRef.current = workspaceRoot;
	const presetIdRef = useRef(presetId);
	presetIdRef.current = presetId;
	// Monotonic guard so the most recent selection wins under rapid clicks.
	const latestCaptureSeqRef = useRef(0);

	const patchData = useCallback((patch: Partial<BrowserPaneData>) => {
		const current = ctxRef.current.pane.data as BrowserPaneData;
		ctxRef.current.actions.updateData({ ...current, ...patch });
	}, []);

	const setEnabled = useCallback(
		async (next: boolean) => {
			try {
				await electronTrpcClient.browser.setDesignMode.mutate({
					paneId,
					enabled: next,
				});
				patchData({ designModeEnabled: next });
				if (!next) setCapture(null);
			} catch {
				toast.error("Could not toggle Design Mode");
			}
		},
		[paneId, patchData],
	);

	const setPreset = useCallback(
		async (id: string) => {
			try {
				await electronTrpcClient.browser.setDevicePreset.mutate({
					paneId,
					presetId: id,
				});
				patchData({ devicePresetId: id });
			} catch {
				toast.error("Could not change device preset");
			}
		},
		[paneId, patchData],
	);

	// Re-apply a persisted non-default preset after the webview (re)attaches.
	useEffect(() => {
		if (presetId === DEFAULT_DEVICE_PRESET_ID) return;
		electronTrpcClient.browser.setDevicePreset
			.mutate({ paneId, presetId })
			.catch(() => {
				// Best-effort reapply on reattach; a failure is non-critical.
			});
	}, [paneId, presetId]);

	// While enabled, listen for in-page selections and capture them. Deps are
	// kept stable (no workspaceRoot/presetId) so a click is never dropped during
	// a resubscribe; those values are read from refs at capture time.
	useEffect(() => {
		if (!enabled) return;
		const sub = electronTrpcClient.browser.onDesignEvent.subscribe(
			{ paneId },
			{
				onData: (event: DesignModeEvent) => {
					if (event.type !== "selected") return;
					const seq = ++latestCaptureSeqRef.current;
					setCapturing(true);
					electronTrpcClient.browser.captureElement
						.mutate({
							paneId,
							workspaceId,
							workspaceRoot: workspaceRootRef.current,
							devicePresetId: presetIdRef.current,
							clientPoint: event.clientPoint,
						})
						.then((result) => {
							if (seq === latestCaptureSeqRef.current) setCapture(result);
						})
						.catch(() => {
							if (seq === latestCaptureSeqRef.current) {
								toast.error("Could not capture the selected element");
							}
						})
						.finally(() => {
							if (seq === latestCaptureSeqRef.current) setCapturing(false);
						});
				},
			},
		);
		return () => sub.unsubscribe();
	}, [enabled, paneId, workspaceId]);

	const dismissCapture = useCallback(() => setCapture(null), []);

	return {
		enabled,
		setEnabled,
		presetId,
		setPreset,
		capture,
		capturing,
		dismissCapture,
		workspaceId,
		browserSessionId: paneId,
	};
}
