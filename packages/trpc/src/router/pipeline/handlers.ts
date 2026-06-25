import { validateOutput } from "@rox/workflow-core";
import type { BlockHandler } from "@rox/workflow-runtime";
// Import the model handler from the leaf subpath (not the package barrel) so
// loading this module never re-enters the `@rox/workflow-runtime` barrel that
// `run-pipeline.ts` is already evaluating (avoids "Export named … not found").
import {
	type ClassifyPort,
	type EmbedPort,
	type ModelGeneratePort,
	makeClassifierHandler,
	makeConditionHandler,
	makeDbQueryHandler,
	makeDbWriteHandler,
	makeEmbeddingHandler,
	makeGateHandler,
	makeHttpHandler,
	makeMergeHandler,
	makeModelHandler,
	makeParserHandler,
	makeRagHandler,
	makeStructuredExtractHandler,
	makeSwitchHandler,
	makeTransformHandler,
	makeVariableSetHandler,
	makeWebSearchHandler,
	type StructuredExtractPort,
} from "@rox/workflow-runtime/handlers";
import { makePipelineDbQuery, makePipelineDbWrite } from "./db-port";
import { pipelineHttpRequest } from "./http-port";
import {
	generatePipelineObject,
	generatePipelineText,
	pipelineEmbed,
} from "./model-provider";
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
 * Real classification port for the `classifier` block. Reuses the pipeline model
 * provider (no new LLM client): builds a strict zero-shot prompt that forces the
 * model to answer with exactly one label, then matches the reply back to the
 * candidate set (case-insensitive, also accepting the label as a substring of a
 * one-line answer). The handler re-validates that the returned label is in-set.
 */
const classify: ClassifyPort = async (req) => {
	const labelList = req.labels.map((l) => `- ${l}`).join("\n");
	const system =
		"You are a strict zero-shot text classifier. Choose exactly ONE label from " +
		"the provided list that best fits the text. Reply with ONLY that label, " +
		"verbatim, and nothing else.";
	const prompt = [
		req.instruction ? `Context: ${req.instruction}` : null,
		"Labels:",
		labelList,
		"",
		"Text:",
		req.text,
		"",
		"Answer with exactly one label from the list above:",
	]
		.filter((line) => line != null)
		.join("\n");

	const { text } = await generatePipelineText({
		model: req.model,
		system,
		prompt,
		temperature: 0,
	});

	const reply = text.trim();
	const exact = req.labels.find((l) => l.toLowerCase() === reply.toLowerCase());
	if (exact) return { label: exact, score: 1 };

	// Tolerate a verbose one-line answer that still names a single label.
	const contained = req.labels.find((l) =>
		reply.toLowerCase().includes(l.toLowerCase()),
	);
	if (contained) return { label: contained, score: 0.5 };

	// Out-of-set reply: return it as-is so the handler routes to `error`.
	return { label: reply };
};

/**
 * Real structured-extraction port for the `structured_extract` block. Reuses the
 * pipeline model provider in forced-JSON mode (`generatePipelineObject`), passing
 * the node's JSON schema into the prompt so the model shapes its output; the
 * handler then validates the returned value against the same schema with
 * `validateOutput`.
 */
const structuredExtract: StructuredExtractPort = async (req) => {
	const system =
		"You extract structured data and respond with a single JSON object that " +
		"conforms to the provided JSON schema. Output only valid JSON.";
	const prompt = [
		"JSON schema the output must satisfy:",
		JSON.stringify(req.schema),
		"",
		"Instruction / source text:",
		req.prompt,
	].join("\n");

	const { object } = await generatePipelineObject({
		model: req.model,
		system,
		prompt,
		temperature: 0,
	});
	return { object };
};

/**
 * Real embedding port for the `embedding` block. Reuses the pipeline embedding
 * provider (OpenAI `text-embedding-3-small`); throws when unconfigured so the
 * node routes to its `error` port.
 */
const embed: EmbedPort = async (req) => {
	const { embedding, usage } = await pipelineEmbed(req.text);
	return { embedding, usage };
};

/**
 * Assemble the per-block-type handler map injected into the WorkflowExecutor for
 * a pipeline run. DB-free composition: each executor node type (model,
 * http_request, logic nodes, data nodes, AI nodes, knowledge_retrieval, db, and
 * tool nodes) registers its handler here, wired to its real port.
 * `agent_run`/`skill_call` stay on their dedicated resolver seams and are NOT
 * part of this map.
 *
 * `scope` carries the run's org/project tenancy. It is required to wire the
 * tenant-bounded ports (`knowledge_retrieval`, `db_query`, `db_write`); when
 * omitted (e.g. unit tests that only exercise model/http nodes) those handlers
 * are left unregistered and their nodes fall back to pass-through.
 *
 * TOOL NODES (#545): `web_search` is wired to a server-side provider port
 * (provider-abstraction in `web-search-port.ts`) — it self-reports a typed
 * `WEB_SEARCH_NOT_CONFIGURED` error when no provider key is set, so it is always
 * registered. `tool_call` and `mcp_tool` ship pure handlers + fake-port tests but
 * their real impure ports need an `McpContext` (bearer/userId/requestId) that a
 * pipeline run's `scope` does not carry; wiring them is a `run-pipeline` seam
 * follow-up, so both pass through unchanged until then.
 *
 * AI NODES (#548): classifier / structured_extract / embedding reuse the server
 * LLM/embedding provider (env credentials), so they need no tenancy scope and
 * register unconditionally; the handlers route to `error` when no credentials
 * are configured.
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
		// Tool node: provider-abstraction web search. Self-reports a typed
		// not-configured error when no provider key is set, so always registered.
		web_search: makeWebSearchHandler(makePipelineWebSearch()),
		// AI nodes reuse the server LLM/embedding provider (env credentials), so
		// they need no tenancy scope and register unconditionally. The handlers
		// route to their `error` port when no credentials are configured.
		classifier: makeClassifierHandler(classify),
		structured_extract: makeStructuredExtractHandler(
			structuredExtract,
			validateOutput,
		),
		embedding: makeEmbeddingHandler(embed),
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
