/**
 * Graph core (#01) — `search` read-path (spec §3.3, §2.1 procedure 11).
 *
 * The core does NOT run an embedder/qdrant process; it owns the read-path
 * contract and falls back to keyword search when the embedder is unavailable.
 * Dependencies (qdrant search client + embedder) are injected by the runtime
 * (#02) via `createGraphSearchService(deps)`. With no qdrant client wired,
 * semantic search degrades to keyword (`degraded: true`) instead of throwing.
 */

import { db } from "@rox/db/client";
import { type EntityKind, entities } from "@rox/db/schema";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

export interface SearchHit {
	id: string;
	kind: EntityKind;
	slug: string | null;
	title: string;
	status: string;
	updatedAt: Date;
	score?: number;
	snippet?: string;
}

export interface SearchParams {
	orgId: string;
	query: string;
	kinds?: EntityKind[];
	mode?: "semantic" | "keyword";
	v2ProjectId?: string;
	status?: "active" | "archived" | "trashed";
	limit: number;
}

export interface SearchResult {
	hits: SearchHit[];
	/** True when semantic was requested but keyword was used (embedder down). */
	degraded: boolean;
}

/** A semantic hit returned by the qdrant client (#02). Score in [0,1]. */
export interface SemanticHit {
	entityId: string;
	score: number;
	snippet?: string;
}

/**
 * Injected qdrant/embedder dependency (#02). `semanticSearch` embeds `query`
 * and searches the `rox_entities` collection with an `orgId` payload filter.
 */
export interface GraphSearchDeps {
	semanticSearch?: (params: {
		orgId: string;
		query: string;
		kinds?: EntityKind[];
		v2ProjectId?: string;
		status?: string;
		limit: number;
	}) => Promise<SemanticHit[]>;
}

export interface GraphSearchService {
	search(params: SearchParams): Promise<SearchResult>;
}

/**
 * Build the search service. Pass `{ semanticSearch }` from #02 to enable
 * semantic mode; omit it (dev/local or embedder down) to always use keyword.
 */
export function createGraphSearchService(
	deps: GraphSearchDeps = {},
): GraphSearchService {
	return {
		async search(params: SearchParams): Promise<SearchResult> {
			const mode = params.mode ?? "semantic";
			const status = params.status ?? "active";

			if (mode === "semantic" && deps.semanticSearch) {
				try {
					const semantic = await deps.semanticSearch({
						orgId: params.orgId,
						query: params.query,
						kinds: params.kinds,
						v2ProjectId: params.v2ProjectId,
						status,
						limit: params.limit,
					});
					const hits = await hydrateSemanticHits(
						{ ...params, status },
						semantic,
					);
					return { hits, degraded: false };
				} catch {
					// Embedder/qdrant unavailable → degrade to keyword, never throw.
					const hits = await keywordSearch({ ...params, status });
					return { hits, degraded: true };
				}
			}

			const hits = await keywordSearch({ ...params, status });
			// Degraded only when the caller wanted semantic but we lacked the client.
			return { hits, degraded: mode === "semantic" };
		},
	};
}

/** Keyword search over title/markdown (mirrors `knowledge.search`). */
async function keywordSearch(
	params: SearchParams & { status: string },
): Promise<SearchHit[]> {
	const term = `%${params.query}%`;
	const conditions = [
		eq(entities.organizationId, params.orgId),
		eq(entities.status, params.status as "active" | "archived" | "trashed"),
		or(ilike(entities.title, term), ilike(entities.markdown, term)),
	];
	if (params.kinds && params.kinds.length > 0) {
		conditions.push(inArray(entities.kind, params.kinds));
	}
	if (params.v2ProjectId) {
		conditions.push(eq(entities.v2ProjectId, params.v2ProjectId));
	}

	const rows = await db
		.select({
			id: entities.id,
			kind: entities.kind,
			slug: entities.slug,
			title: entities.title,
			status: entities.status,
			updatedAt: entities.updatedAt,
		})
		.from(entities)
		.where(and(...conditions))
		.orderBy(desc(entities.updatedAt))
		.limit(params.limit);

	return rows;
}

/** Resolve semantic hit ids to entity summaries (org-scoped, preserving order). */
async function hydrateSemanticHits(
	params: SearchParams & { status: string },
	semantic: SemanticHit[],
): Promise<SearchHit[]> {
	if (semantic.length === 0) return [];
	const ids = semantic.map((h) => h.entityId);
	const conditions = [
		eq(entities.organizationId, params.orgId),
		eq(entities.status, params.status as "active" | "archived" | "trashed"),
		inArray(entities.id, ids),
	];
	if (params.kinds && params.kinds.length > 0) {
		conditions.push(inArray(entities.kind, params.kinds));
	}
	if (params.v2ProjectId) {
		conditions.push(eq(entities.v2ProjectId, params.v2ProjectId));
	}
	const rows = await db
		.select({
			id: entities.id,
			kind: entities.kind,
			slug: entities.slug,
			title: entities.title,
			status: entities.status,
			updatedAt: entities.updatedAt,
		})
		.from(entities)
		.where(and(...conditions));

	const byId = new Map(rows.map((r) => [r.id, r]));
	const out: SearchHit[] = [];
	for (const hit of semantic) {
		const row = byId.get(hit.entityId);
		if (!row) continue; // dropped if stale payload violates DB filters
		out.push({ ...row, score: hit.score, snippet: hit.snippet });
	}
	return out;
}
