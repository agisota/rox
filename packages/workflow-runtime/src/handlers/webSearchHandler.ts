import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/** A single web-search result returned to the pipeline. Provider-agnostic. */
export interface WebSearchResult {
	title: string;
	url: string;
	/** Snippet/content excerpt for the result. */
	content: string;
}

/** Request handed to the injected web-search port for a `web_search` block. */
export interface WebSearchRequest {
	/** Resolved search query (placeholders already expanded). */
	query: string;
	/** Max results to return (`subBlocks.maxResults`). */
	maxResults: number;
}

export interface WebSearchResponse {
	results: WebSearchResult[];
}

/**
 * Impure web-search port: runs the query against the configured search provider
 * and returns ranked results. Injected by the run-service so the executor stays
 * SDK/key-free — it is a provider abstraction, NOT one hardcoded API: the
 * run-service picks the concrete provider (Tavily/etc.) and resolves its key via
 * `ctx.resolveSecret` (mirrors {@link import("./ragHandler").RetrievalPort}).
 *
 * Contract: throw {@link WebSearchNotConfiguredError} when no provider/key is
 * configured — the handler maps it to a graceful `error` handle with a clear
 * "search provider not configured" message rather than a silent empty result.
 * Any other thrown error is treated as a search failure.
 */
export type WebSearchPort = (
	req: WebSearchRequest,
) => Promise<WebSearchResponse>;

/**
 * Marker error a {@link WebSearchPort} throws when no search provider is
 * configured (no provider selected or its API key is missing). The handler maps
 * it to the `error` handle so an unconfigured search surfaces explicitly.
 */
export class WebSearchNotConfiguredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebSearchNotConfiguredError";
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

const DEFAULT_MAX_RESULTS = 5;
const MIN_MAX_RESULTS = 1;
const MAX_MAX_RESULTS = 50;

function clampMaxResults(value: number | undefined): number {
	if (value == null) return DEFAULT_MAX_RESULTS;
	return Math.min(
		MAX_MAX_RESULTS,
		Math.max(MIN_MAX_RESULTS, Math.trunc(value)),
	);
}

/**
 * Resolve the search query for a `web_search` node. Prefers the node's own
 * configured `query` (`subBlocks.query`) with `{{path}}` placeholders expanded
 * from the merged upstream input (so an upstream node's output can drive the
 * search), and falls back to the merged input's `query` field. Returns
 * `undefined` when neither yields a non-empty string. Mirrors the RAG node's
 * query resolution so placeholder semantics stay identical across node types.
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
 * Build the `web_search` block handler. Reads the node config from
 * `block.subBlocks` (query, maxResults), resolves the query from the node config
 * or the merged upstream input, then delegates the actual search to the injected
 * {@link WebSearchPort}. Returns `{ output: { results } }` on success, or routes
 * the failure to the `error` handle — including the explicit "query missing" and
 * "search provider not configured" cases, surfaced rather than silently empty.
 */
export function makeWebSearchHandler(search: WebSearchPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const maxResults = clampMaxResults(asNumber(sub.maxResults));

		const query = resolveQuery(sub, ctx.input);
		if (query == null) {
			return {
				handle: "error",
				error: {
					code: "WEB_SEARCH_QUERY_MISSING",
					message:
						"Web Search node has no query configured (subBlocks.query) and no upstream `query` input.",
					blockId: ctx.blockId,
				},
			};
		}

		try {
			const { results } = await search({ query, maxResults });
			return { handle: "out", output: { results } };
		} catch (err) {
			const notConfigured = err instanceof WebSearchNotConfiguredError;
			return {
				handle: "error",
				error: {
					code: notConfigured
						? "WEB_SEARCH_NOT_CONFIGURED"
						: "WEB_SEARCH_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
