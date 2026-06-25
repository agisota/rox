import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	type EmbeddingModel,
	embed,
	generateObject,
	generateText,
	type LanguageModel,
} from "ai";

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
/**
 * Embedding model for the `embedding` node. OpenAI's `text-embedding-3-small`
 * is a fixed-dimension (1536) model — Rox has no in-repo vector store yet (the
 * RAG slice #542 is lexical), so this is the minimal embedding seam: it requires
 * an OpenAI key and is the single embedding provider for now.
 */
const OPENAI_DEFAULT_EMBEDDING_MODEL_ID = "text-embedding-3-small";

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

export interface PipelineGenerateObjectResult {
	/** The parsed JSON object the model produced (forced JSON mode). */
	object: unknown;
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
}

/**
 * Execute one LLM call forced into JSON output for a pipeline
 * `structured_extract` node. Uses the AI SDK's `generateObject` in `no-schema`
 * mode so the provider returns a parsed JSON value WITHOUT binding to a Zod
 * schema — the node's own JSON Schema is validated downstream by
 * `@rox/workflow-core`'s `validateOutput` (the handler owns schema enforcement).
 * Throws when no credentials are available so the node routes to its `error`
 * port. Reuses the same credential resolution as `generatePipelineText`.
 */
export async function generatePipelineObject(
	req: PipelineGenerateRequest,
): Promise<PipelineGenerateObjectResult> {
	const model = getPipelineLanguageModel(req.model);
	if (!model) {
		throw new Error(
			"No LLM credentials available for the structured_extract node (set ANTHROPIC_API_KEY or OPENAI_API_KEY on the server).",
		);
	}

	const result = await generateObject({
		model,
		output: "no-schema",
		system: req.system,
		prompt: req.prompt,
		temperature: req.temperature,
		maxOutputTokens: req.maxTokens,
	});

	return {
		object: result.object,
		usage: {
			inputTokens: result.usage?.inputTokens,
			outputTokens: result.usage?.outputTokens,
			totalTokens: result.usage?.totalTokens,
		},
	};
}

/**
 * Resolve an AI-SDK embedding model for the `embedding` node. The only provider
 * wired today is OpenAI (`text-embedding-3-small`, 1536 dims); Rox has no
 * in-repo embedding/vector layer yet. Returns null when no OpenAI credentials
 * are configured. Reuses the same `OPENAI_API_KEY` resolution as the LLM path.
 */
export function getPipelineEmbeddingModel(): EmbeddingModel | null {
	const openaiKey = process.env.OPENAI_API_KEY?.trim();
	if (openaiKey && isOpenAIApiKey(openaiKey)) {
		return createOpenAI({ apiKey: openaiKey }).embedding(
			OPENAI_DEFAULT_EMBEDDING_MODEL_ID,
		);
	}
	return null;
}

export interface PipelineEmbedResult {
	/** Fixed-dimension embedding vector for the input text. */
	embedding: number[];
	usage?: { tokens?: number };
}

/**
 * Embed one text for a pipeline `embedding` node and return its vector. Throws
 * when no embedding credentials are available so the node routes the failure to
 * its `error` port (never a silent empty vector). Uses the AI SDK's `embed`; it
 * does not introduce a new HTTP client.
 */
export async function pipelineEmbed(
	text: string,
): Promise<PipelineEmbedResult> {
	const model = getPipelineEmbeddingModel();
	if (!model) {
		throw new Error(
			"No embedding credentials available for the embedding node (set OPENAI_API_KEY on the server).",
		);
	}

	const result = await embed({ model, value: text });
	return {
		embedding: result.embedding,
		usage: { tokens: result.usage?.tokens },
	};
}
