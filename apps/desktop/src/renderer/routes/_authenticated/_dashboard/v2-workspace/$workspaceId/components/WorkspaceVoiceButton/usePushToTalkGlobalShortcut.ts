import type { VoiceConnectionState } from "@rox/rtc";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logger } from "renderer/lib/logger";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export interface UsePushToTalkGlobalShortcutArgs {
	/** Current voice-room connection state. */
	state: VoiceConnectionState;
	/** Toggles the local participant's mic mute (from the voice room hook). */
	toggleMute: () => Promise<void>;
}

/**
 * Renderer half of the desktop push-to-talk global shortcut
 * (`live.pushToTalkDesktop`).
 *
 * This hook must be mounted ONLY behind the `live.pushToTalkDesktop`
 * `ExperimentalFeatureGate` (so the global shortcut is inert until the feature
 * is enabled + usable). While mounted it:
 *  1. reports voice-room connect/disconnect to the main process, which is what
 *     actually arms/disarms the OS-level `globalShortcut`, and
 *  2. subscribes to global-shortcut presses and TOGGLES the mic — but only
 *     while connected (a press with no live room is a no-op).
 *
 * Toggle (not hold) semantics: Electron `globalShortcut` accelerators are
 * press-only, so each press flips mute on/off.
 */
export function usePushToTalkGlobalShortcut({
	state,
	toggleMute,
}: UsePushToTalkGlobalShortcutArgs): void {
	const isConnected = state === "connected";

	// Keep the latest toggle + connection flag in refs so the long-lived
	// subscription callback never goes stale and we don't resubscribe per render.
	const toggleRef = useRef(toggleMute);
	toggleRef.current = toggleMute;
	const connectedRef = useRef(isConnected);
	connectedRef.current = isConnected;

	// Arm/disarm the main-process global shortcut by reporting connection state.
	// On unmount (e.g. the gate closes or the room control leaves the DOM) we
	// always report disconnected so the OS accelerator is released.
	useEffect(() => {
		electronTrpcClient.pushToTalk.setRoomConnected
			.mutate({ connected: isConnected })
			.catch((error) => {
				logger.error(
					"[pushToTalk] Failed to report room connection state:",
					error,
				);
			});
		return () => {
			electronTrpcClient.pushToTalk.setRoomConnected
				.mutate({ connected: false })
				.catch((error) => {
					logger.error(
						"[pushToTalk] Failed to clear room connection state:",
						error,
					);
				});
		};
	}, [isConnected]);

	electronTrpc.pushToTalk.presses.useSubscription(undefined, {
		onData: () => {
			// Defend in depth: main only registers the shortcut while connected,
			// but a press that races a disconnect must still be a no-op.
			if (!connectedRef.current) return;
			toggleRef.current().catch((error) => {
				logger.error("[pushToTalk] Failed to toggle mic from shortcut:", error);
			});
		},
		onError: (error) => {
			logger.error("[pushToTalk] Press subscription error:", error);
		},
	});
}
