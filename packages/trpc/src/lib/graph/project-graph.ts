/**
 * Project OS (#01, Phase-1) — native object-graph read for one `v2_project`.
 *
 * Walks the existing universal graph (`entities` + `edges`) for a single
 * project: every node `WHERE v2_project_id = P`, plus the resolved edges
 * incident to those nodes (depth 1). Neighbor nodes reached over an edge that
 * are NOT themselves project-scoped are hydrated as summaries too, so the UI can
 * label a linked object that lives outside the project (e.g. a shared contact).
 *
 * This is READ-ONLY and reuses the core schema directly (mirrors the inline read
 * in `graphRouter.neighbors`); the graph-service stays the only WRITER. The pure
 * `assembleProjectGraph` step is split out so the walk is unit-testable without a
 * live database.
 */

import type { EdgeRelation } from "@rox/db/schema";
import { type EntityKind, edges, entities } from "@rox/db/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { GraphDb } from "./types";

/** A node in the project object graph (entity summary). */
export interface ProjectGraphNode {
	entityId: string;
	kind: EntityKind;
	title: string;
	slug: string | null;
	/** True when the node itself is scoped to the project (`v2_project_id = P`). */
	inProject: boolean;
}

/** A resolved edge incident to a project node. */
export interface ProjectGraphEdge {
	id: string;
	sourceEntityId: string;
	targetEntityId: string | null;
	relation: EdgeRelation;
	resolved: boolean;
}

export interface ProjectGraphResult {
	nodes: ProjectGraphNode[];
	edges: ProjectGraphEdge[];
	/** True when the node budget capped the walk (more graph exists). */
	truncated: boolean;
}

/** Minimal entity-summary row the walk consumes (DB-shape-independent). */
export interface EntitySummaryRow {
	id: string;
	kind: EntityKind;
	title: string;
	slug: string | null;
}

/** Minimal resolved-edge row the walk consumes. */
export interface EdgeRow {
	id: string;
	sourceEntityId: string;
	targetEntityId: string | null;
	relation: EdgeRelation;
	resolved: boolean;
}

/**
 * Pure assembly of the project object graph from already-fetched rows.
 *
 * `projectRows` are the entities scoped to the project; `neighborRows` are the
 * extra entities reached over an edge that live outside the project; `edgeRows`
 * are the resolved edges incident to the project nodes. Node identity is
 * deduped by id (a project node always wins over a neighbor of the same id).
 * `truncated` is passed through from the caller (the DB read applies the cap).
 */
export function assembleProjectGraph(params: {
	projectRows: readonly EntitySummaryRow[];
	neighborRows: readonly EntitySummaryRow[];
	edgeRows: readonly EdgeRow[];
	truncated: boolean;
}): ProjectGraphResult {
	const nodeById = new Map<string, ProjectGraphNode>();

	for (const row of params.projectRows) {
		nodeById.set(row.id, {
			entityId: row.id,
			kind: row.kind,
			title: row.title,
			slug: row.slug,
			inProject: true,
		});
	}
	for (const row of params.neighborRows) {
		// A project node already present must not be downgraded to a neighbor.
		if (nodeById.has(row.id)) continue;
		nodeById.set(row.id, {
			entityId: row.id,
			kind: row.kind,
			title: row.title,
			slug: row.slug,
			inProject: false,
		});
	}

	// Only keep edges whose endpoints we actually surfaced as nodes, so the UI
	// never references a node it was not given (drops edges to pruned neighbors).
	const outEdges: ProjectGraphEdge[] = [];
	for (const e of params.edgeRows) {
		const hasSource = nodeById.has(e.sourceEntityId);
		const hasTarget =
			e.targetEntityId != null && nodeById.has(e.targetEntityId);
		if (!hasSource || !hasTarget) continue;
		outEdges.push({
			id: e.id,
			sourceEntityId: e.sourceEntityId,
			targetEntityId: e.targetEntityId,
			relation: e.relation,
			resolved: e.resolved,
		});
	}

	return {
		nodes: [...nodeById.values()],
		edges: outEdges,
		truncated: params.truncated,
	};
}

export interface LoadProjectGraphParams {
	orgId: string;
	v2ProjectId: string;
	/** Lifecycle filter for the project nodes (default: active). */
	status?: "active" | "archived" | "trashed";
	/** Max project nodes to walk from (bounds the read). Default 200. */
	limit: number;
}

/**
 * Load the object graph for one project (org-scoped). Reads only — never writes.
 *
 * 1. project nodes: entities `WHERE org=$ AND v2_project_id=$ AND status=$`
 *    (capped at `limit`, newest first).
 * 2. incident edges: resolved edges where source OR target is a project node.
 * 3. neighbor nodes: entity summaries for edge endpoints outside the project
 *    set (so a link to a shared/out-of-project object still renders a label).
 */
export async function loadProjectGraph(
	db: GraphDb,
	params: LoadProjectGraphParams,
): Promise<ProjectGraphResult> {
	const status = params.status ?? "active";

	const projectRows = await db
		.select({
			id: entities.id,
			kind: entities.kind,
			title: entities.title,
			slug: entities.slug,
		})
		.from(entities)
		.where(
			and(
				eq(entities.organizationId, params.orgId),
				eq(entities.v2ProjectId, params.v2ProjectId),
				eq(entities.status, status),
			),
		)
		.orderBy(desc(entities.updatedAt), entities.id)
		.limit(params.limit + 1);

	// `limit + 1` probe → trim back to `limit` and flag the overflow.
	const truncated = projectRows.length > params.limit;
	const boundedProjectRows = truncated
		? projectRows.slice(0, params.limit)
		: projectRows;

	const projectIds = boundedProjectRows.map((r) => r.id);
	if (projectIds.length === 0) {
		return { nodes: [], edges: [], truncated: false };
	}
	const projectIdSet = new Set(projectIds);

	const edgeRows = await db
		.select({
			id: edges.id,
			sourceEntityId: edges.sourceEntityId,
			targetEntityId: edges.targetEntityId,
			relation: edges.relation,
			resolved: edges.resolved,
		})
		.from(edges)
		.where(
			and(
				eq(edges.organizationId, params.orgId),
				eq(edges.resolved, true),
				or(
					inArray(edges.sourceEntityId, projectIds),
					inArray(edges.targetEntityId, projectIds),
				),
			),
		);

	// Endpoints reached over an edge that are NOT project nodes → hydrate labels.
	const neighborIds = new Set<string>();
	for (const e of edgeRows) {
		if (!projectIdSet.has(e.sourceEntityId)) neighborIds.add(e.sourceEntityId);
		if (e.targetEntityId && !projectIdSet.has(e.targetEntityId)) {
			neighborIds.add(e.targetEntityId);
		}
	}

	const neighborRows =
		neighborIds.size > 0
			? await db
					.select({
						id: entities.id,
						kind: entities.kind,
						title: entities.title,
						slug: entities.slug,
					})
					.from(entities)
					.where(
						and(
							eq(entities.organizationId, params.orgId),
							inArray(entities.id, [...neighborIds]),
						),
					)
			: [];

	return assembleProjectGraph({
		projectRows: boundedProjectRows,
		neighborRows,
		edgeRows,
		truncated,
	});
}
