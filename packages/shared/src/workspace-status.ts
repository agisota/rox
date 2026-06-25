/**
 * Shared workspace surface status model (mobile workspace cards epic, FN-055).
 *
 * Platform-agnostic on purpose: desktop, web, and mobile all render the same
 * "is this Claude session / terminal alive?" badge, so the status vocabulary and
 * the derivation rules live here once instead of being re-encoded per platform.
 *
 * The model is intentionally connection-oriented rather than a mirror of any one
 * backend table. A mobile card shows the *surface* status of a workspace's Claude
 * session or terminal, which is a blend of:
 *   1. whether the owning host is reachable at all (offline host -> `unavailable`),
 *   2. the lifecycle of the durable session / terminal row itself, and
 *   3. transient connection state while Electric/tRPC catches up (`connecting`).
 *
 * Keeping the vocabulary small (six states) lets the card map each state to a
 * single colour + label without per-platform branching.
 */

/**
 * Surface status for a workspace Claude session or terminal.
 *
 * - `idle`        — known to exist, nothing running right now (ready to resume).
 * - `connecting`  — the client is attaching / data is still streaming in.
 * - `live`        — actively running (a Claude turn in flight, or a live pty).
 * - `ended`       — the session/terminal finished cleanly and will not resume.
 * - `error`       — it terminated abnormally (non-zero exit, crashed turn).
 * - `unavailable` — cannot be reached (host offline, or no data synced yet).
 */
export type WorkspaceSurfaceStatus =
	| "idle"
	| "connecting"
	| "live"
	| "ended"
	| "error"
	| "unavailable";

/** All surface statuses, ordered most-active first. Stable for iteration/tests. */
export const WORKSPACE_SURFACE_STATUSES: readonly WorkspaceSurfaceStatus[] = [
	"live",
	"connecting",
	"idle",
	"error",
	"ended",
	"unavailable",
] as const;

/** The status a card shows before any data has synced for the workspace. */
export const DEFAULT_WORKSPACE_SURFACE_STATUS: WorkspaceSurfaceStatus =
	"unavailable";

/**
 * Priority for aggregating several surfaces into one workspace-level badge
 * (higher wins). Mirrors the desktop notification precedence: a live surface
 * dominates an idle one, and any real signal dominates `unavailable`.
 */
const STATUS_PRIORITY: Record<WorkspaceSurfaceStatus, number> = {
	live: 5,
	connecting: 4,
	error: 3,
	idle: 2,
	ended: 1,
	unavailable: 0,
};

/** Narrowing guard so untyped/persisted strings can be validated at the edge. */
export function isWorkspaceSurfaceStatus(
	value: unknown,
): value is WorkspaceSurfaceStatus {
	return (
		typeof value === "string" &&
		Object.hasOwn(STATUS_PRIORITY, value as WorkspaceSurfaceStatus)
	);
}

/** Whether the surface is currently doing work (drives the pulsing affordance). */
export function isActiveSurfaceStatus(status: WorkspaceSurfaceStatus): boolean {
	return status === "live" || status === "connecting";
}

/** Whether the surface reached a final state (no further updates expected). */
export function isTerminalSurfaceStatus(
	status: WorkspaceSurfaceStatus,
): boolean {
	return status === "ended" || status === "error";
}

/**
 * Collapse several surface statuses into the single status a workspace card
 * badge should show. Empty input (no surfaces synced) reads as `unavailable`,
 * matching {@link DEFAULT_WORKSPACE_SURFACE_STATUS}. Pure so it is unit-testable
 * without React or Electric.
 */
export function highestPriorityStatus(
	statuses: Iterable<WorkspaceSurfaceStatus>,
): WorkspaceSurfaceStatus {
	let best: WorkspaceSurfaceStatus = DEFAULT_WORKSPACE_SURFACE_STATUS;
	let bestPriority = -1;
	for (const status of statuses) {
		const priority = STATUS_PRIORITY[status];
		if (priority > bestPriority) {
			best = status;
			bestPriority = priority;
		}
	}
	return best;
}

/**
 * Map a durable session / terminal lifecycle field plus host reachability to a
 * surface status. Shared by every platform's data hook so the lifecycle->badge
 * rules stay identical.
 *
 * `lifecycle` is the raw row state (`running` | `idle` | `ended` | `error` |
 * `starting`) as stored by the host; `hostOnline` reflects whether the owning
 * host is currently reachable. An offline host always reads `unavailable` so a
 * stale `running` row never shows as live after the laptop sleeps.
 */
export type SurfaceLifecycle =
	| "starting"
	| "running"
	| "idle"
	| "ended"
	| "error";

export interface DeriveSurfaceStatusInput {
	/** Raw lifecycle from the synced row, or null when no row exists yet. */
	lifecycle: SurfaceLifecycle | null | undefined;
	/** Whether the owning host is reachable. Defaults to true when unknown. */
	hostOnline?: boolean | null;
	/** True while the client is still attaching / the first snapshot loads. */
	isConnecting?: boolean;
}

export function deriveSurfaceStatus({
	lifecycle,
	hostOnline,
	isConnecting,
}: DeriveSurfaceStatusInput): WorkspaceSurfaceStatus {
	// A finished session is final regardless of host — surface it even if the
	// host later goes offline so history reads correctly.
	if (lifecycle === "ended") return "ended";
	if (lifecycle === "error") return "error";

	// Host offline (or explicitly unreachable) hides any live/idle signal.
	if (hostOnline === false) return "unavailable";

	if (isConnecting || lifecycle === "starting") return "connecting";
	if (lifecycle === "running") return "live";
	if (lifecycle === "idle") return "idle";

	// No row yet and host not known offline: still waiting on data.
	return "unavailable";
}
