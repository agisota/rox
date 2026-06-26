/**
 * Pure data + presentation helpers for the issue-board surface
 * (`projectOs.issueBoard`). Dependency-free (no React, no tRPC) so the panel
 * stays a thin render layer and the grouping is unit-testable.
 *
 * The board reuses two SHIPPED queries with no new procedure and no migration:
 *   - columns ← `task.statuses.list` (the org's `task_statuses`, position-ordered),
 *   - cards   ← `task.list` (the org's real `tasks` with status/assignee joins).
 *
 * This is an ORG-WIDE status board: every column is one org task status and the
 * cards are the org's real tasks grouped by status. Project scoping is NOT done
 * here — `tasks` are org-scoped only (no `v2_project_id`) and are not mirrored
 * into the entities graph, so there is no real task→project link to filter on. A
 * project-scoped board is a documented follow-up that needs that linkage first.
 */

// ---------------------------------------------------------------------------
// Inputs — the slices of the shipped query outputs this surface consumes.
// ---------------------------------------------------------------------------

/** A column source: one row from `task.statuses.list`. */
export interface BoardStatus {
	id: string;
	name: string;
	color: string;
	type: string;
	position: number;
}

/** The task slice a card needs (subset of `task.list`'s `task` object). */
export interface BoardTask {
	id: string;
	slug: string;
	title: string;
	statusId: string;
	priority: string;
}

/** A card source: one row from `task.list` (task + joined people + status name). */
export interface BoardCardRow {
	task: BoardTask;
	assignee: { id: string; name: string; image: string | null } | null;
	creator: { id: string; name: string; image: string | null } | null;
	statusName: string | null;
}

// ---------------------------------------------------------------------------
// Outputs — the view model the panel renders.
// ---------------------------------------------------------------------------

/** A presentational card on the board. */
export interface BoardCard {
	id: string;
	slug: string;
	title: string;
	priority: string;
	priorityLabel: string;
	assigneeName: string | null;
	assigneeImage: string | null;
}

/** A presentational column (a status) with its cards, in board order. */
export interface BoardColumn {
	id: string;
	name: string;
	color: string;
	type: string;
	cards: BoardCard[];
}

/** RU labels for `task_priority` (schema enum: none/low/medium/high/urgent). */
const PRIORITY_LABELS: Record<string, string> = {
	none: "Без приоритета",
	low: "Низкий",
	medium: "Средний",
	high: "Высокий",
	urgent: "Срочно",
};

export function priorityLabel(priority: string): string {
	return PRIORITY_LABELS[priority] ?? priority;
}

/** The synthetic column id for cards whose status is absent from the column set. */
export const UNGROUPED_COLUMN_ID = "__ungrouped__";

function toCard(row: BoardCardRow): BoardCard {
	return {
		id: row.task.id,
		slug: row.task.slug,
		title: row.task.title,
		priority: row.task.priority,
		priorityLabel: priorityLabel(row.task.priority),
		assigneeName: row.assignee?.name ?? null,
		assigneeImage: row.assignee?.image ?? null,
	};
}

/**
 * Group real task cards into status columns, preserving the column order from
 * `task.statuses.list` (already position-sorted server-side; we re-sort by
 * `position` defensively so the mapping is order-independent of its input).
 *
 * Every status becomes a column even when it has no cards (an empty column is a
 * real, meaningful board state). A card whose `statusId` matches no column is
 * collected into a trailing "Без статуса" column ONLY when at least one such card
 * exists — this never hides a task, even if the statuses list is stale relative
 * to the tasks list (defensive; in a consistent org every task's status is listed).
 */
export function groupTasksByStatus(
	statuses: readonly BoardStatus[],
	cards: readonly BoardCardRow[],
): BoardColumn[] {
	const ordered = [...statuses].sort((a, b) => a.position - b.position);
	const columnById = new Map<string, BoardColumn>();
	const out: BoardColumn[] = [];
	for (const status of ordered) {
		const column: BoardColumn = {
			id: status.id,
			name: status.name,
			color: status.color,
			type: status.type,
			cards: [],
		};
		columnById.set(status.id, column);
		out.push(column);
	}

	const ungrouped: BoardCard[] = [];
	for (const row of cards) {
		const column = columnById.get(row.task.statusId);
		if (column) {
			column.cards.push(toCard(row));
		} else {
			ungrouped.push(toCard(row));
		}
	}

	if (ungrouped.length > 0) {
		out.push({
			id: UNGROUPED_COLUMN_ID,
			name: "Без статуса",
			color: "#94a3b8",
			type: "backlog",
			cards: ungrouped,
		});
	}

	return out;
}

/** Total cards across all columns (header count). */
export function countBoardCards(columns: readonly BoardColumn[]): number {
	let total = 0;
	for (const column of columns) total += column.cards.length;
	return total;
}
