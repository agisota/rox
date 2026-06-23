import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSession } from "@/lib/auth/client";

/**
 * Mobile realtime layer for the comms (chat) inbox.
 *
 * React Native has no native `EventSource`, mobile auth is a Cookie header (not
 * `withCredentials`), and the comms event bus is in-process/single-instance only
 * (`@rox/shared/comms-events`) with tRPC refetch documented as the backstop — so
 * the chosen strategy is ADAPTIVE POLLING, not an SSE polyfill. This keeps the
 * existing `apiClient` + Cookie-header auth, adds ZERO new dependencies, and adds
 * ZERO CORS surface. (The pure routing seam `decideRefetch` exists so an SSE
 * variant could later swap behind this same interface.)
 *
 * Battery rules (without these the feature is net-negative):
 *   - poll only while `AppState === "active"` AND a chat surface is mounted;
 *   - pause entirely on background and resume on foreground;
 *   - base interval 10s with no thread open, 5s while a thread is open;
 *   - fire one immediate refresh on the background→active transition.
 *
 * Guarded on `activeOrganizationId` (the `useDevicePresence` pattern): no org,
 * no polling. Cache-first (AGENTS.md #9) is the callers' responsibility — the
 * chat hooks' `refresh()` replaces rows only on success and never blanks the list
 * mid-poll, so calling them here is safe.
 */

export interface UseCommsRealtimeArgs {
	/** The open chat thread id, or `null` when only the list is mounted. */
	openThreadId: string | null;
	/**
	 * Refresh the chat thread list (mirrors `useCommsThreads().refresh`). Omit on
	 * the thread screen, which does not own the list hook.
	 */
	onRefreshThreads?: () => void | Promise<void>;
	/**
	 * Refresh the open chat thread's messages. Omit when no thread surface is
	 * mounted (the list screen). Receives the live `openThreadId`.
	 */
	onRefreshOpenThread?: (threadId: string) => void | Promise<void>;
}

const BASE_INTERVAL_MS = 10_000;
const OPEN_THREAD_INTERVAL_MS = 5_000;

export function useCommsRealtime({
	openThreadId,
	onRefreshThreads,
	onRefreshOpenThread,
}: UseCommsRealtimeArgs): void {
	const { data: session } = useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	// Keep the latest selection + callbacks readable inside the long-lived
	// interval/AppState handlers without re-arming them on every render.
	const argsRef = useRef<UseCommsRealtimeArgs>({
		openThreadId,
		onRefreshThreads,
		onRefreshOpenThread,
	});
	argsRef.current = { openThreadId, onRefreshThreads, onRefreshOpenThread };

	const runRefresh = useCallback(() => {
		const { openThreadId: id, onRefreshThreads: threads } = argsRef.current;
		const openThread = argsRef.current.onRefreshOpenThread;
		if (threads) void threads();
		if (id && openThread) void openThread(id);
	}, []);

	const intervalMs = openThreadId ? OPEN_THREAD_INTERVAL_MS : BASE_INTERVAL_MS;

	useEffect(() => {
		// No org scope -> nothing to poll for (mirrors useDevicePresence guard).
		if (!activeOrganizationId) return;

		let timer: ReturnType<typeof setInterval> | null = null;

		const startPolling = () => {
			if (timer) return;
			timer = setInterval(runRefresh, intervalMs);
		};

		const stopPolling = () => {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		};

		const handleAppStateChange = (next: AppStateStatus) => {
			if (next === "active") {
				// Foreground transition: pull once immediately so the user does not
				// wait a full interval for the catch-up, then resume polling.
				runRefresh();
				startPolling();
			} else {
				stopPolling();
			}
		};

		const subscription = AppState.addEventListener(
			"change",
			handleAppStateChange,
		);

		// Start polling only if the app is currently foregrounded.
		if (AppState.currentState === "active") startPolling();

		return () => {
			subscription.remove();
			stopPolling();
		};
	}, [activeOrganizationId, intervalMs, runRefresh]);
}
