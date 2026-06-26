/**
 * Issue-board pure helpers — PROMOTED to `@rox/shared/issue-board` so the web
 * board panel and the desktop parity panel
 * (`apps/desktop/.../ProjectObjectGraph/IssueBoardPanel.tsx`) import the SAME
 * single source of truth. This barrel re-exports the shared module so the
 * existing web imports (`./issueBoard`) keep resolving unchanged.
 *
 * Precedent: `@rox/shared/unified-search-results` (#444),
 * `@rox/shared/session-object-link` (#451), `@rox/shared/crm-contacts` (#452).
 */
export {
	type BoardCard,
	type BoardCardRow,
	type BoardColumn,
	type BoardStatus,
	type BoardTask,
	countBoardCards,
	groupTasksByStatus,
	priorityLabel,
	UNGROUPED_COLUMN_ID,
} from "@rox/shared/issue-board";
