import type { PopoutPaneKind } from "shared/types/popout";

/**
 * Map a `@rox/panes` pane `kind` string to a tear-off {@link PopoutPaneKind},
 * or null when the pane kind isn't one that supports being popped out (F52).
 *
 * Only chat / file-tree / terminal panes can be torn off into their own window.
 * Note the pane registry uses the kind `"file"` (not `"file-tree"`); the popout
 * contract names it `"file-tree"`, so we translate here.
 */
export function toPopoutPaneKind(kind: string): PopoutPaneKind | null {
	switch (kind) {
		case "chat":
			return "chat";
		case "file":
			return "file-tree";
		case "terminal":
			return "terminal";
		default:
			return null;
	}
}

/** Whether a pane of this kind can be torn off into its own window. */
export function isPopoutablePaneKind(kind: string): boolean {
	return toPopoutPaneKind(kind) !== null;
}
