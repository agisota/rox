import { isPopoutPaneKind, type PopoutPaneKind } from "shared/types/popout";

/**
 * A single pane resolved out of a serialized `@rox/panes` layout snapshot.
 *
 * The popout window is a *view onto the one core-state*: it receives the same
 * JSON snapshot the main window's `@rox/panes` store serializes, finds the torn
 * off pane by id, and renders just that pane. We keep this parser independent of
 * the (workspace-package) store so it is unit-testable and degrades gracefully
 * on malformed input rather than throwing inside the render tree.
 */
export interface RehydratedPane {
	paneId: string;
	kind: PopoutPaneKind;
	/** Opaque pane viewer data (FilePaneData | TerminalPaneData | ChatPaneData…). */
	data: unknown;
}

export interface PopoutRouteParams {
	workspaceId: string;
	paneId: string;
	kind: PopoutPaneKind;
	paneLayoutJson: string;
}

/**
 * Parse the popout route's query into a typed payload, or null when required
 * params are missing / the kind is unknown. Accepts a `URLSearchParams`-like
 * accessor so it works the same against the hash query in any window.
 */
export function parsePopoutParams(
	get: (key: string) => string | null,
): PopoutRouteParams | null {
	const workspaceId = get("workspaceId");
	const paneId = get("paneId");
	const kind = get("kind");
	const paneLayoutJson = get("paneLayout");
	if (!workspaceId || !paneId || !paneLayoutJson) return null;
	if (!isPopoutPaneKind(kind)) return null;
	return { workspaceId, paneId, kind, paneLayoutJson };
}

interface SerializedPane {
	id?: unknown;
	kind?: unknown;
	data?: unknown;
}
interface SerializedTab {
	// `@rox/panes` serializes panes as a Record<string, Pane>, keyed by pane id.
	panes?: Record<string, unknown>;
}
interface SerializedLayout {
	tabs?: unknown;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Find a pane by id inside a serialized `WorkspaceState` snapshot.
 *
 * The real `@rox/panes` snapshot shape is
 * `{ version, tabs: [{ panes: { [paneId]: { id, kind, data } } }] }` — panes are
 * a *record keyed by id*, not an array. We tolerate unknown/missing fields so a
 * stale or partial snapshot resolves to null instead of crashing the popout.
 * `fallbackKind` (the kind the tear-off was requested with) is used only when
 * the serialized pane omits its own `kind`.
 */
export function rehydratePane(
	paneLayoutJson: string,
	paneId: string,
	fallbackKind: PopoutPaneKind,
): RehydratedPane | null {
	let layout: SerializedLayout;
	try {
		layout = JSON.parse(paneLayoutJson) as SerializedLayout;
	} catch {
		return null;
	}

	for (const tab of asArray(layout.tabs) as SerializedTab[]) {
		const panes = tab?.panes;
		if (!panes || typeof panes !== "object") continue;
		const pane = panes[paneId] as SerializedPane | undefined;
		if (pane && typeof pane === "object") {
			const kind = isPopoutPaneKind(pane.kind) ? pane.kind : fallbackKind;
			return { paneId, kind, data: pane.data ?? null };
		}
	}
	return null;
}
