import type { EntityKind } from "@rox/db/enums";

/**
 * Pure data + presentation helpers for the issue-board surface
 * (`projectOs.issueBoard`). Dependency-free (no React, no tRPC) so the panel
 * stays a thin render layer and the grouping is unit-testable.
 *
 * The board reuses two SHIPPED queries with no new procedure and no migration:
 *   - columns ← `task.statuses.list` (the org's `task_statuses`, position-ordered),
 *   - cards   ← `task.list` (the org's real `tasks` with status/assignee joins).
 *
 * Project scoping reuses the SHIPPED `graph.projectGraph` edge-walk: a project's
 * `task`-kind graph nodes carry the same `slug` as the task row (the natural key
 * is `(org, kind, slug)`), so {@link selectProjectTaskSlugs} extracts the project's
 * task slugs and {@link filterCardsToProjectSlugs} narrows the org card set to that
 * project. With no project selected the full org board renders. No `tasks` column
 * change, no FK, no migration — tasks stay org-scoped and the project intersection
 * is derived from the existing object graph.
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

// ---------------------------------------------------------------------------
// Project scoping — derive a project's task slugs from the shipped graph walk.
// ---------------------------------------------------------------------------

/** The slice of a `graph.projectGraph` node this surface consumes. */
export interface ProjectGraphNodeSlice {
	entityId: string;
	kind: EntityKind;
	title: string;
	slug: string | null;
	inProject: boolean;
}

/** The slice of a `graph.projectGraph` result this surface consumes. */
export interface ProjectGraphSlice {
	nodes: readonly ProjectGraphNodeSlice[];
}

/**
 * Extract the set of task slugs that belong to the project, from its object
 * graph. Only `task`-kind nodes that are themselves scoped to the project
 * (`inProject`) and carry a `slug` count — a slug is the join key back to a
 * `tasks` row (`(org, kind, slug)` natural key). Returns an empty set when the
 * project has no task nodes (the caller then shows an empty-but-real board).
 */
export function selectProjectTaskSlugs(graph: ProjectGraphSlice): Set<string> {
	const slugs = new Set<string>();
	for (const node of graph.nodes) {
		if (node.kind !== "task") continue;
		if (!node.inProject) continue;
		if (!node.slug) continue;
		slugs.add(node.slug);
	}
	return slugs;
}

/**
 * Narrow the org-wide card rows to only those whose task slug is in the given
 * project slug set. Used when a project is selected; with no project selected
 * the caller passes the full org card set straight through (no filter).
 */
export function filterCardsToProjectSlugs(
	cards: readonly BoardCardRow[],
	projectSlugs: ReadonlySet<string>,
): BoardCardRow[] {
	return cards.filter((row) => projectSlugs.has(row.task.slug));
}
