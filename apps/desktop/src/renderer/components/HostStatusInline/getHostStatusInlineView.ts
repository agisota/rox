import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

export type HostStatusDotTone = "ready" | "starting" | "idle";

export interface HostStatusInlineView {
	/** Dot color tone, mirroring AddHostModal's green/yellow/muted indicator. */
	tone: HostStatusDotTone;
	/** Whether to render the spinner alongside the dot. */
	showSpinner: boolean;
	/** RU status label shown next to the dot. */
	label: string;
	/** Whether to offer the one-click "Подключить" action. */
	showConnect: boolean;
}

/**
 * Derive the inline host-status presentation from the readiness gate and the
 * coordinator status. Pure so it can be unit-tested without rendering.
 *
 * `hostReady` (a live host url exists) wins over `status` so a brief stale
 * "stopped"/"unknown" never contradicts an already-reachable host.
 */
export function getHostStatusInlineView(
	status: HostServiceAvailabilityStatus,
	hostReady: boolean,
	connecting = false,
): HostStatusInlineView {
	if (hostReady || status === "running") {
		return {
			tone: "ready",
			showSpinner: false,
			label: "Хост готов",
			showConnect: false,
		};
	}

	if (status === "starting" || connecting) {
		return {
			tone: "starting",
			showSpinner: true,
			label: "Поднимаем хост…",
			showConnect: false,
		};
	}

	// stopped / unknown: host is down and not coming up on its own right now.
	return {
		tone: "idle",
		showSpinner: false,
		label: "Хост не готов",
		showConnect: true,
	};
}
