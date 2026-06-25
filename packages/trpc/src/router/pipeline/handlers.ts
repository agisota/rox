import type { BlockHandler } from "@rox/workflow-runtime";
// Import the model handler from the leaf subpath (not the package barrel) so
// loading this module never re-enters the `@rox/workflow-runtime` barrel that
// `run-pipeline.ts` is already evaluating (avoids "Export named … not found").
import {
	type ModelGeneratePort,
	makeConditionHandler,
	makeDbQueryHandler,
	makeDbWriteHandler,
	makeGateHandler,
	makeHttpHandler,
	makeMergeHandler,
	makeModelHandler,
	makeParserHandler,
	makeRagHandler,
	makeSwitchHandler,
	makeTransformHandler,
	makeVariableSetHandler,
	makeWebSearchHandler,
} from "@rox/workflow-runtime/handlers";
import { makePipelineDbQuery, makePipelineDbWrite } from "./db-port";
import { pipelineHttpRequest } from "./http-port";
import { generatePipelineText } from "./model-provider";
import { makePipelineRetrieval, type RagPortScope } from "./rag-port";
import { makePipelineWebSearch } from "./web-search-port";

/**
 * Real LLM port for the `model` block: resolves provider credentials and runs a
 * single `generateText` call. Lives here (not in `@rox/workflow-runtime`) so the
 * executor stays DB/SDK-free — the runtime only sees the injected port.
 */
const modelGenerate: ModelGeneratePort = async (req) => {
	const { text, usage } = await generatePipelineText({
		model: req.model,
		system: req.system,
		prompt: req.prompt,
		temperature: req.temperature,
		maxTokens: req.maxTokens,
	});
	return { text, usage };
};

/**
 * Assemble the per-block-type handler map injected into the WorkflowExecutor for
 * a pipeline run. DB-free composition: each executor node type (model,
 * http_request, logic nodes, data nodes, knowledge_retrieval, and — added by
 * sibling issues — db/tools/etc.) registers its handler here, wired to its real
 * port. `agent_run`/`skill_call` stay on their dedicated resolver seams and are
 * NOT part of this map.
 *
 * `scope` carries the run's org/project tenancy. It is required to wire the
 * `knowledge_retrieval` (RAG) port (org-scoped retrieval); when omitted (e.g.
 * unit tests that only exercise model/http nodes) the RAG handler is left
 * unregistered and a `knowledge_retrieval` node falls back to pass-through.
 *
 * TOOL NODES (#545): `web_search` is wired here to a server-side provider port
 * (Tavily; provider-abstraction in `web-search-port.ts`) — it self-reports a
 * typed `WEB_SEARCH_NOT_CONFIGURED` error when no provider key is set, so it is
 * always registered. `tool_call` and `mcp_tool` are intentionally NOT registered
 * yet and fall back to pass-through:
 *   - Their pure handlers (`makeToolCallHandler` / `makeMcpToolHandler`) and port
 *     contracts ship in `@rox/workflow-runtime/handlers` and are unit-tested
 *     against fake ports.
 *   - The real impure ports cannot be wired in this slice: Rox's MCP layer
 *     (`@rox/mcp-v2` `AgentSourcePool` / `McpDownstreamClient`) needs an
 *     `McpContext` (bearer token, userId, requestId) to resolve+call downstream
 *     tools, but a pipeline run's `scope` only carries `organizationId` +
 *     `v2ProjectId`. There is also no standalone "project tool registry" seam —
 *     project tools are surfaced through the same MCP downstream sources. Wiring
 *     these requires threading an `McpContext` (or a credential-bearing caller)
 *     into `buildPipelineHandlers`, which is a `run-pipeline` seam change tracked
 *     as a follow-up. Until then both nodes pass through unchanged.
 */
export function buildPipelineHandlers(
	scope?: RagPortScope,
): Record<string, BlockHandler> {
	const handlers: Record<string, BlockHandler> = {
		model: makeModelHandler(modelGenerate),
		http_request: makeHttpHandler(pipelineHttpRequest),
		// Logic nodes are pure (no injected port): they branch on the merged input
		// with a safe expression evaluator and route via `result.handle`.
		condition: makeConditionHandler(),
		switch: makeSwitchHandler(),
		merge: makeMergeHandler(),
		gate: makeGateHandler(),
		route: makeGateHandler(),
		// Data nodes are pure transforms over the merged input.
		transform: makeTransformHandler(),
		parser: makeParserHandler(),
		variable_set: makeVariableSetHandler(),
		// Tool node: provider-abstraction web search (Tavily). Self-reports a typed
		// not-configured error when no provider key is set, so always registered.
		web_search: makeWebSearchHandler(makePipelineWebSearch()),
	};
	if (scope) {
		handlers.knowledge_retrieval = makeRagHandler(makePipelineRetrieval(scope));
		// db nodes are tenant-bounded: their ports are built from the run's org
		// scope, so a node can never read or mutate another organization's data.
		// Gated on `scope` for the same reason as RAG — without a tenancy they fall
		// back to pass-through rather than running unscoped against the DB.
		handlers.db_query = makeDbQueryHandler(makePipelineDbQuery(scope));
		handlers.db_write = makeDbWriteHandler(makePipelineDbWrite(scope));
	}
	return handlers;
}
