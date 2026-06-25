import type {
	WebSearchPort,
	WebSearchRequest,
	WebSearchResponse,
} from "@rox/workflow-runtime/handlers";
import { WebSearchNotConfiguredError } from "@rox/workflow-runtime/handlers";

/**
 * Real web-search port for the `web_search` block. Lives here (not in
 * `@rox/workflow-runtime`) so the executor stays SDK/key-free — the runtime only
 * sees the injected port.
 *
 * PROVIDER ABSTRACTION (not one hardcoded API): the concrete provider is chosen
 * here behind the {@link WebSearchPort} contract. The current slice ships a
 * Tavily provider (the same provider Rox's chat web-search route uses); adding
 * another provider means adding a branch in {@link resolveProvider} — the
 * handler/port contract (`{ results }`) is unchanged.
 *
 * KEYS: resolved server-side from the server environment (`TAVILY_API_KEY`),
 * mirroring how the `model` node resolves provider credentials from
 * `process.env` (pipelines run on the server; credentials are not threaded from
 * the desktop host). When no provider key is available the port throws
 * {@link WebSearchNotConfiguredError}, which the handler surfaces as a typed
 * `error` handle ("search provider not configured") rather than a silent empty
 * result.
 */

/** A provider implementation: runs one query, returns ranked results. */
type SearchProvider = (req: WebSearchRequest) => Promise<WebSearchResponse>;

/**
 * Tavily provider. The SDK lives in `@tavily/core` (already a Rox dependency for
 * the chat web-search route). Imported dynamically so loading this module stays
 * side-effect-free when web search is unused.
 */
function tavilyProvider(apiKey: string): SearchProvider {
	return async (req) => {
		const { tavily } = await import("@tavily/core");
		const client = tavily({ apiKey });
		const response = await client.search(req.query, {
			maxResults: req.maxResults,
		});
		return {
			results: response.results.map((r) => ({
				title: r.title,
				url: r.url,
				content: r.content,
			})),
		};
	};
}

/**
 * Pick the provider for this run from the server environment. Add new providers
 * here as additional branches; returns `null` when none is configured so the
 * port can throw the typed not-configured error.
 */
function resolveProvider(): SearchProvider | null {
	const tavilyKey = process.env.TAVILY_API_KEY?.trim();
	if (tavilyKey) return tavilyProvider(tavilyKey);
	return null;
}

/**
 * Build the injected {@link WebSearchPort} for a pipeline run. The provider key
 * is read from the server environment at call time (so a key rotated mid-process
 * is picked up); when nothing is configured the port throws the typed
 * not-configured error.
 */
export function makePipelineWebSearch(): WebSearchPort {
	return async (req) => {
		const provider = resolveProvider();
		if (provider == null) {
			throw new WebSearchNotConfiguredError(
				"No web-search provider is configured (set TAVILY_API_KEY or bind a search-provider secret).",
			);
		}
		return provider(req);
	};
}
