import type { SelectTerminal } from "@rox/db/schema";
import { deriveSurfaceStatus } from "@rox/shared/workspace-status";
import type { WorkspaceSurface } from "@/hooks/useClaudeSession/selectClaudeSession";

const EMPTY_SURFACE: WorkspaceSurface = {
	status: "unavailable",
	title: null,
	lastActiveAt: null,
	id: null,
};

function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function toTime(value: Date | string | null | undefined): number {
	const date = toDate(value);
	return date ? date.getTime() : 0;
}

/**
 * Pick the most relevant terminal for a workspace and derive its surface status.
 * Same "newest by last-active, then created" rule as the Claude session
 * selector, sharing the {@link WorkspaceSurface} contract so both cards render
 * identically. Pure — unit tested without Electric.
 */
export function selectTerminalStatus(
	terminals: SelectTerminal[] | undefined,
	workspaceId: string,
	options: { isConnecting?: boolean; hostOnline?: boolean | null } = {},
): WorkspaceSurface {
	if (!workspaceId || !terminals || terminals.length === 0) {
		return options.isConnecting
			? { ...EMPTY_SURFACE, status: "connecting" }
			: EMPTY_SURFACE;
	}

	let best: SelectTerminal | null = null;
	let bestTime = -1;
	for (const terminal of terminals) {
		if (terminal.workspaceId !== workspaceId) continue;
		const time = Math.max(
			toTime(terminal.lastActiveAt),
			toTime(terminal.createdAt),
		);
		if (time > bestTime) {
			best = terminal;
			bestTime = time;
		}
	}

	if (!best) {
		return options.isConnecting
			? { ...EMPTY_SURFACE, status: "connecting" }
			: EMPTY_SURFACE;
	}

	return {
		status: deriveSurfaceStatus({
			lifecycle: best.status,
			hostOnline: options.hostOnline,
			isConnecting: options.isConnecting,
		}),
		title: best.title ?? null,
		lastActiveAt: toDate(best.lastActiveAt),
		id: best.id,
	};
}
