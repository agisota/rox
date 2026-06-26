/**
 * Project OS comments (#11) — pure helpers for the object comment section.
 *
 * The implementation now lives in the cross-platform core
 * (`@rox/shared/object-comments`) so the web `(agents)`, desktop, and any future
 * mobile comment surface share ONE unit-tested source of truth (same pattern as
 * `@rox/shared/crm-contacts`). This module re-exports it to preserve the desktop
 * import path (`./comments-helpers`) used by `CommentsSection` and its tests.
 */
export {
	COMMENT_MAX_LENGTH,
	canSubmitComment,
	type PanelComment,
	sortCommentsOldestFirst,
} from "@rox/shared/object-comments";
