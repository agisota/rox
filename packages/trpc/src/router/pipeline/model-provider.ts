import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";

/**
 * Server-side LLM provider for the pipeline `model` node. Pipelines execute on
 * the server (tRPC), so credentials come from the server environment
 * (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) — not the desktop host's local auth
 * storage (that path belongs to `@rox/chat`'s small-model, which can't be
 * imported here without a chat↔trpc package cycle). Uses the same AI SDK as the
 * rest of Rox; it does not introduce a new HTTP client.
 */

const MIN_API_KEY_LENGTH = 30;
const ANTHROPIC_DEFAULT_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_DEFAULT_MODEL_ID = "gpt-4o-mini";

function isAnthropicApiKey(key: string): boolean {
	return key.startsWith("sk-ant-api") && key.length >= MIN_API_KEY_LENGTH;
}

function isOpenAIApiKey(key: string): boolean {
	return key.startsWith("sk-") && key.length >= MIN_API_KEY_LENGTH;
}

function isOpenAIModelId(modelId: string): boolean {
	return (
		modelId.startsWith("gpt") ||
		modelId.startsWith("o1") ||
		modelId.startsWith("o3") ||
		modelId.startsWith("o4") ||
		modelId.startsWith("chatgpt")
	);
}

export interface PipelineGenerateRequest {
	/** Provider model id from the node config; falls back to a small default. */
	model?: string;
	system?: string;
	prompt: string;
	temperature?: number;
	maxTokens?: number;
}

export interface PipelineGenerateResult {
	text: string;
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
}

/**
 * Resolve an AI-SDK language model for a `model` node, routing by the requested
 * model id (Anthropic `claude*`, OpenAI `gpt*`/`o*`). Returns null when no
 * server credentials are configured for the chosen provider.
 */
export function getPipelineLanguageModel(
	modelId?: string,
): LanguageModel | null {
	const wantsOpenAI = modelId != null && isOpenAIModelId(modelId);

	if (!wantsOpenAI) {
		const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
		if (anthropicKey && isAnthropicApiKey(anthropicKey)) {
			return createAnthropic({ apiKey: anthropicKey })(
				modelId ?? ANTHROPIC_DEFAULT_MODEL_ID,
			);
		}
	}

	const openaiKey = process.env.OPENAI_API_KEY?.trim();
	if (openaiKey && isOpenAIApiKey(openaiKey)) {
		return createOpenAI({ apiKey: openaiKey }).chat(
			modelId && wantsOpenAI ? modelId : OPENAI_DEFAULT_MODEL_ID,
		);
	}

	return null;
}

/**
 * Execute one LLM call for a pipeline `model` node and return text + token
 * usage. Throws when no credentials are available so the node routes the failure
 * to its `error` port (never a silent empty result).
 */
export async function generatePipelineText(
	req: PipelineGenerateRequest,
): Promise<PipelineGenerateResult> {
	const model = getPipelineLanguageModel(req.model);
	if (!model) {
		throw new Error(
			"No LLM credentials available for the model node (set ANTHROPIC_API_KEY or OPENAI_API_KEY on the server).",
		);
	}

	const result = await generateText({
		model,
		system: req.system,
		prompt: req.prompt,
		temperature: req.temperature,
		maxOutputTokens: req.maxTokens,
	});

	return {
		text: result.text,
		usage: {
			inputTokens: result.usage?.inputTokens,
			outputTokens: result.usage?.outputTokens,
			totalTokens: result.usage?.totalTokens,
		},
	};
}
