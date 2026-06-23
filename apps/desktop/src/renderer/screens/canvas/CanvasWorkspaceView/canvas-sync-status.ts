export const CANVAS_ACTIVE_REFRESH_INTERVAL_MS = 5_000;

interface CanvasSyncStatusInput {
	activeCanvasId?: string | null;
	isFetching: boolean;
	lastRefreshAt?: Date | null;
	lastRefreshError?: string | null;
	refreshIntervalMs?: number;
	workspaceId?: string | null;
}

function formatRefreshTime(date: Date): string {
	return date.toISOString().slice(11, 19);
}

export function getCanvasSyncStatus({
	activeCanvasId,
	isFetching,
	lastRefreshAt,
	lastRefreshError,
	refreshIntervalMs = CANVAS_ACTIVE_REFRESH_INTERVAL_MS,
	workspaceId,
}: CanvasSyncStatusInput): string {
	if (!workspaceId) return "Sync idle: no workspace";
	if (!activeCanvasId) return "Sync waiting: no active canvas";
	if (lastRefreshError) return `Live sync: retrying after ${lastRefreshError}`;
	if (isFetching) return "Live sync: refreshing canonical document";

	const refreshSeconds = Math.max(1, Math.round(refreshIntervalMs / 1000));
	const lastRefresh = lastRefreshAt
		? ` · last ${formatRefreshTime(lastRefreshAt)} UTC`
		: "";

	return `Live sync: polling every ${refreshSeconds}s${lastRefresh}`;
}
