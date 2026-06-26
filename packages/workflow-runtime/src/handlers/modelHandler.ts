import type { RunCost } from "@rox/workflow-core";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";

/**
 * Request handed to the injected LLM port for a `model` block. Kept provider-
 * agnostic so `@rox/workflow-runtime` stays SDK-free: the run-service wires the
 * real provider (see `@rox/trpc` pipeline handlers), unit tests inject a fake.
 */
export interface ModelGenerateRequest {
	/** Model id from the node config (`subBlocks.model`), provider-specific. */
	model?: string;
	/** Resolved system prompt (placeholders already expanded). */
	system?: string;
	/** Resolved user prompt (placeholders already expanded). */
	prompt: string;
	temperature?: number;
	maxTokens?: number;
}

export interface ModelGenerateUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

export interface ModelGenerateResult {
	text: string;
	usage?: ModelGenerateUsage;
	/** Optional monetary/token cost recorded on the step. */
	cost?: RunCost;
}

/**
 * Impure LLM port: resolves credentials + calls the provider. Injected by the
 * run-service so the executor stays DB/SDK-free (mirrors the agent-run resolver).
 */
export type ModelGeneratePort = (
	req: ModelGenerateRequest,
) => Promise<ModelGenerateResult>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/** Walk a dotted path (`a.b.c`) against a record; undefined on any miss. */
function getPath(source: Record<string, unknown>, path: string): unknown {
	let cur: unknown = source;
	for (const key of path.split(".")) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[key];
	}
	return cur;
}

const PLACEHOLDER = /\{\{\s*([\w.$-]+)\s*\}\}/g;

/**
 * Expand `{{path}}` placeholders in a prompt against the block's merged input.
 * Lightweight single-scope resolution (immediate upstream output); the richer
 * cross-node `{{node.field}}` resolver lands in the data-passing issue (#550).
 */
export function resolvePromptTemplate(
	template: string,
	input: Record<string, unknown>,
): string {
	return template.replace(PLACEHOLDER, (_match, path: string) => {
		const value = getPath(input, path);
		if (value == null) return "";
		return typeof value === "string" ? value : JSON.stringify(value);
	});
}

/**
 * Build the `model` block handler. Reads the node config from `block.subBlocks`
 * (model id, system/user prompt, temperature, maxTokens), expands prompt
 * placeholders from the merged upstream input, then delegates the LLM call to
 * the injected {@link ModelGeneratePort}. Returns `{ output: { text, usage },
 * cost }` on success or routes the failure to the `error` handle.
 */
export function makeModelHandler(generate: ModelGeneratePort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const model = asString(sub.model);
		const systemRaw = asString(sub.systemPrompt);
		const userRaw = asString(sub.userPrompt) ?? asString(sub.prompt);
		const temperature = asNumber(sub.temperature);
		const maxTokens = asNumber(sub.maxTokens);

		if (userRaw == null || userRaw.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "MODEL_PROMPT_MISSING",
					message:
						"Model node has no user prompt configured (subBlocks.userPrompt).",
					blockId: ctx.blockId,
				},
			};
		}

		const system =
			systemRaw != null
				? resolvePromptTemplate(systemRaw, ctx.input)
				: undefined;
		const prompt = resolvePromptTemplate(userRaw, ctx.input);

		try {
			const result = await generate({
				model,
				system,
				prompt,
				temperature,
				maxTokens,
			});
			const cost: RunCost | undefined =
				result.cost ??
				(result.usage
					? {
							inputTokens: result.usage.inputTokens,
							outputTokens: result.usage.outputTokens,
						}
					: undefined);
			return {
				handle: "out",
				output: { text: result.text, usage: result.usage ?? {} },
				cost,
			};
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "MODEL_CALL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
