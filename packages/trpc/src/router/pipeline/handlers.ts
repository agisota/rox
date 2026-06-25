import type { BlockHandler } from "@rox/workflow-runtime";
// Import the model handler from the leaf subpath (not the package barrel) so
// loading this module never re-enters the `@rox/workflow-runtime` barrel that
// `run-pipeline.ts` is already evaluating (avoids "Export named … not found").
import {
	type ModelGeneratePort,
	makeConditionHandler,
	makeGateHandler,
	makeHttpHandler,
	makeMergeHandler,
	makeModelHandler,
	makeParserHandler,
	makeSwitchHandler,
	makeTransformHandler,
	makeVariableSetHandler,
} from "@rox/workflow-runtime/handlers";
import { pipelineHttpRequest } from "./http-port";
import { generatePipelineText } from "./model-provider";

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
 * http_request, logic nodes, data nodes, and — added by sibling issues —
 * rag/db/tools/etc.) registers its handler here, wired to its real port.
 * `agent_run`/`skill_call` stay on their dedicated resolver seams and are NOT
 * part of this map.
 */
export function buildPipelineHandlers(): Record<string, BlockHandler> {
	return {
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
	};
}
