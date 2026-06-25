import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * A single retrieved chunk returned to the pipeline. Provider-agnostic so
 * `@rox/workflow-runtime` stays DB/SDK-free: the run-service wires the real
 * retrieval layer (see `@rox/trpc` pipeline handlers), unit tests inject a fake.
 */
export interface RetrievedChunk {
	/** The chunk text fed downstream (e.g. into a `model` node's prompt). */
	text: string;
	/** Relevance score (higher = better), when the retriever exposes one. */
	score?: number;
	/** Id of the source document this chunk came from. */
	sourceId?: string;
}

/** A source document referenced by one or more retrieved chunks. */
export interface RetrievedSource {
	id: string;
	title?: string;
	/** Optional URL/slug the UI can link the citation to. */
	url?: string;
}

/** Request handed to the injected retrieval port for a `knowledge_retrieval` block. */
export interface RetrievalRequest {
	/** Knowledge-base binding from the node config (`subBlocks.knowledgeBase`). */
	knowledgeBaseId: string;
	/** Resolved search query (placeholders already expanded). */
	query: string;
	/** Max chunks to return (`subBlocks.topK`). */
	topK: number;
}

export interface RetrievalResult {
	chunks: RetrievedChunk[];
	sources: RetrievedSource[];
}

/**
 * Impure retrieval port: resolves the bound knowledge base and runs the
 * semantic/full-text search. Injected by the run-service so the executor stays
 * DB/SDK-free (mirrors {@link import("./modelHandler").ModelGeneratePort}).
 *
 * Contract: throw {@link KnowledgeBaseNotFoundError} (or any error whose message
 * explains the miss) when the knowledge base is not bound / not found — the
 * handler turns it into a graceful `error` handle rather than a silent empty
 * result, as the execution spec requires.
 */
export type RetrievalPort = (req: RetrievalRequest) => Promise<RetrievalResult>;

/**
 * Marker error a {@link RetrievalPort} throws when the requested knowledge base
 * cannot be resolved. The handler maps it to the `error` handle with a clear
 * message; any other thrown error is treated as a retrieval failure.
 */
export class KnowledgeBaseNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "KnowledgeBaseNotFoundError";
	}
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

const DEFAULT_TOP_K = 5;
const MIN_TOP_K = 1;
const MAX_TOP_K = 100;

function clampTopK(value: number | undefined): number {
	if (value == null) return DEFAULT_TOP_K;
	return Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, Math.trunc(value)));
}

/**
 * Resolve the search query for a `knowledge_retrieval` node. Prefers the node's
 * own configured `query` (`subBlocks.query`), with `{{path}}` placeholders
 * expanded from the merged upstream input (same lightweight resolver the `model`
 * node uses) so an upstream node's output can drive the search. Falls back to the
 * merged input's `query` field when the node has no configured query. Returns
 * `undefined` when neither yields a non-empty string.
 */
function resolveQuery(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): string | undefined {
	const configured = asString(sub.query);
	if (configured != null && configured.trim() !== "") {
		const expanded = resolvePromptTemplate(configured, input).trim();
		if (expanded !== "") return expanded;
	}
	const fromInput = asString(input.query);
	if (fromInput != null && fromInput.trim() !== "") return fromInput.trim();
	return undefined;
}

/**
 * Build the `knowledge_retrieval` (RAG) block handler. Reads the node config
 * from `block.subBlocks` (knowledge-base binding, top-K), resolves the search
 * query from the node config or the merged upstream input, then delegates the
 * actual retrieval to the injected {@link RetrievalPort}. Returns
 * `{ output: { chunks, sources } }` on success, or routes the failure to the
 * `error` handle — including the explicit "knowledge base not bound" case, which
 * is surfaced rather than returned as a silent empty result.
 */
export function makeRagHandler(retrieve: RetrievalPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const knowledgeBaseId = asString(sub.knowledgeBase);
		const topK = clampTopK(asNumber(sub.topK));

		if (knowledgeBaseId == null || knowledgeBaseId.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "KNOWLEDGE_BASE_NOT_BOUND",
					message:
						"Knowledge Retrieval node has no knowledge base bound (subBlocks.knowledgeBase).",
					blockId: ctx.blockId,
				},
			};
		}

		const query = resolveQuery(sub, ctx.input);
		if (query == null) {
			return {
				handle: "error",
				error: {
					code: "KNOWLEDGE_QUERY_MISSING",
					message:
						"Knowledge Retrieval node has no query configured (subBlocks.query) and no upstream `query` input.",
					blockId: ctx.blockId,
				},
			};
		}

		try {
			const result = await retrieve({
				knowledgeBaseId: knowledgeBaseId.trim(),
				query,
				topK,
			});
			return {
				handle: "out",
				output: {
					chunks: result.chunks,
					sources: result.sources,
				},
			};
		} catch (err) {
			const notFound = err instanceof KnowledgeBaseNotFoundError;
			return {
				handle: "error",
				error: {
					code: notFound
						? "KNOWLEDGE_BASE_NOT_FOUND"
						: "KNOWLEDGE_RETRIEVAL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
