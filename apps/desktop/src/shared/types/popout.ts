/**
 * Shared contract for desktop tear-off / popout windows (F52).
 *
 * A popout is a secondary BrowserWindow that renders a *single pane* (chat,
 * file-tree, or terminal) as a view onto the one shared core-state. The main
 * window, the popout window, and the tRPC popout router all speak this contract,
 * so it lives in `shared/` rather than in `main/` or `renderer/`.
 */

/** Pane kinds that can be torn off into their own window. */
export type PopoutPaneKind = "chat" | "file-tree" | "terminal";

export const POPOUT_PANE_KINDS: readonly PopoutPaneKind[] = [
	"chat",
	"file-tree",
	"terminal",
];

export function isPopoutPaneKind(value: unknown): value is PopoutPaneKind {
	return (
		typeof value === "string" &&
		(POPOUT_PANE_KINDS as readonly string[]).includes(value)
	);
}

/**
 * Everything a popout window needs to rehydrate itself from the shared
 * core-state without re-querying: which workspace/pane it mirrors, the pane
 * kind, and the serialized `paneLayout` snapshot (JSON-safe — same shape the
 * `@rox/panes` store serializes) so the new window can `replaceState` on mount.
 */
export interface PopoutWindowPayload {
	/** Workspace this popout is a view onto (single source of truth). */
	workspaceId: string;
	/** The specific pane being torn off. */
	paneId: string;
	kind: PopoutPaneKind;
	/**
	 * Serialized `@rox/panes` layout snapshot (JSON string). The popout renderer
	 * rehydrates its volatile store from this on mount, then stays live via the
	 * same Electric/collections sync as the main window.
	 */
	paneLayoutJson: string;
}

/**
 * Stable id for a popout window — one detached view per (workspace, pane).
 * Re-tearing the same pane focuses the existing window instead of duplicating
 * it, and is also the key under which per-window bounds are persisted.
 */
export function popoutWindowId(workspaceId: string, paneId: string): string {
	return `popout:${workspaceId}:${paneId}`;
}

/** URL-hash query keys used to hand the payload to the popout renderer route. */
export const POPOUT_QUERY_KEYS = {
	workspaceId: "workspaceId",
	paneId: "paneId",
	kind: "kind",
	paneLayout: "paneLayout",
} as const;
