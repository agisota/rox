import { db } from "@rox/db/client";
// Import the table from the leaf schema subpath (not the `@rox/db/schema` barrel)
// so loading this port never re-enters the full schema barrel mid-eval — this
// module is pulled in by `handlers.ts` → `run-pipeline.ts`, and the barrel may
// still be evaluating then (same import-cycle hazard the handlers barrel guards).
import { knowledgeDocuments } from "@rox/db/schema/knowledge";
import type {
	RetrievalRequest,
	RetrievalResult,
} from "@rox/workflow-runtime/handlers";
import { KnowledgeBaseNotFoundError } from "@rox/workflow-runtime/handlers";
import { and, desc, eq, ilike, or } from "drizzle-orm";

/**
 * Org/project scope for a pipeline run, threaded into the RAG port so retrieval
 * is tenant-isolated (mirrors `makeAgentRunResolver`'s scope args). A pipeline
 * always runs for exactly one organization; `v2ProjectId` is the pipeline's
 * project (or null for org-level pipelines).
 */
export interface RagPortScope {
	organizationId: string;
	v2ProjectId: string | null;
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Real retrieval port for the `knowledge_retrieval` (RAG) block, wired to Rox's
 * existing knowledge layer (`knowledge_documents`). Lives here (not in
 * `@rox/workflow-runtime`) so the executor stays DB-free — the runtime only sees
 * the injected port.
 *
 * RETRIEVAL MODEL (current slice): Rox's knowledge layer is document-level —
 * org-scoped `knowledge_documents` searched by title/markdown match (the same
 * `ilike` match the `knowledge.search` tRPC procedure uses). There is no
 * embedding/vector column yet (no pgvector), so this port performs lexical
 * retrieval and maps each matched document to a chunk + source. When the
 * embedding-node issue (#548) lands a vector column + chunker, swap ONLY this
 * port's query internals — the handler/port contract (chunks + sources) is
 * unchanged.
 *
 * KNOWLEDGE-BASE BINDING: the node's `knowledgeBase` value scopes the search.
 * A UUID is treated as a `v2_project_id` (the editor's `knowledgeBases` option
 * source is project-backed); the sentinel "org"/empty scopes to the whole org.
 * Any non-UUID, non-sentinel value cannot be resolved to a base →
 * {@link KnowledgeBaseNotFoundError} (surfaced as a graceful `error` handle,
 * never a silent empty result).
 */
export function makePipelineRetrieval(scope: RagPortScope) {
	return async (req: RetrievalRequest): Promise<RetrievalResult> => {
		const baseId = req.knowledgeBaseId.trim();
		const scopeToProject = UUID_RE.test(baseId);
		const isOrgWide = baseId === "" || baseId.toLowerCase() === "org";

		if (!scopeToProject && !isOrgWide) {
			throw new KnowledgeBaseNotFoundError(
				`Knowledge base "${baseId}" not found (expected a project id or "org").`,
			);
		}

		const term = `%${req.query}%`;
		const conditions = [
			eq(knowledgeDocuments.organizationId, scope.organizationId),
			or(
				ilike(knowledgeDocuments.title, term),
				ilike(knowledgeDocuments.markdown, term),
			),
		];
		if (scopeToProject) {
			conditions.push(eq(knowledgeDocuments.v2ProjectId, baseId));
		} else if (scope.v2ProjectId != null) {
			// Org-wide binding still respects the pipeline's own project scope when
			// it has one, so a project pipeline does not read sibling projects.
			conditions.push(eq(knowledgeDocuments.v2ProjectId, scope.v2ProjectId));
		}

		const rows = await db
			.select({
				id: knowledgeDocuments.id,
				title: knowledgeDocuments.title,
				slug: knowledgeDocuments.slug,
				markdown: knowledgeDocuments.markdown,
			})
			.from(knowledgeDocuments)
			.where(and(...conditions))
			.orderBy(desc(knowledgeDocuments.updatedAt))
			.limit(req.topK);

		return {
			chunks: rows.map((row) => ({
				text: row.markdown ?? row.title,
				sourceId: row.id,
			})),
			sources: rows.map((row) => ({
				id: row.id,
				title: row.title,
				url: `/knowledge/${row.slug}`,
			})),
		};
	};
}
