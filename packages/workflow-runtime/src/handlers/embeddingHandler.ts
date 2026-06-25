import type { BlockHandler, BlockHandlerContext } from "../executor/types";

/**
 * Request handed to the injected embedding port for an `embedding` block. Kept
 * provider-agnostic so `@rox/workflow-runtime` stays SDK-free: the run-service
 * wires the real provider (see `@rox/trpc` pipeline handlers), unit tests inject
 * a fake.
 */
export interface EmbedRequest {
	/** The text to embed (resolved from `subBlocks.text` or the upstream input). */
	text: string;
}

export interface EmbedResult {
	/** Fixed-dimension embedding vector for the input text. */
	embedding: number[];
	/** Token usage, when the provider exposes it. */
	usage?: { tokens?: number };
}

/**
 * Impure embedding port: resolves credentials + calls the provider. Injected by
 * the run-service so the executor stays DB/SDK-free (mirrors
 * {@link import("./modelHandler").ModelGeneratePort}).
 *
 * Contract: throw when no embedding provider is configured — the handler turns
 * the throw into a graceful `error` handle rather than a silent empty vector,
 * as the execution spec requires.
 */
export type EmbedPort = (req: EmbedRequest) => Promise<EmbedResult>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Resolve the text to embed for an `embedding` node. Prefers the node's own
 * configured `text` (`subBlocks.text`); falls back to the merged upstream
 * input's `text` field. Returns `undefined` when neither yields a non-empty
 * string.
 */
function resolveText(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): string | undefined {
	const configured = asString(sub.text);
	if (configured != null && configured.trim() !== "") return configured;
	const fromInput = asString(input.text);
	if (fromInput != null && fromInput.trim() !== "") return fromInput;
	return undefined;
}

/**
 * Build the `embedding` block handler. Reads the input text from the node config
 * (`subBlocks.text`) or the merged upstream input, then delegates the embedding
 * call to the injected {@link EmbedPort}. Returns `{ output: { embedding,
 * dimensions } }` on success, or routes the failure to the `error` handle —
 * including the "no embedding provider configured" case, which is surfaced
 * rather than returned as a silent empty vector.
 */
export function makeEmbeddingHandler(embed: EmbedPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const text = resolveText(sub, ctx.input);

		if (text == null) {
			return {
				handle: "error",
				error: {
					code: "EMBEDDING_TEXT_MISSING",
					message:
						"Embedding node has no text configured (subBlocks.text) and no upstream `text` input.",
					blockId: ctx.blockId,
				},
			};
		}

		try {
			const result = await embed({ text });
			return {
				handle: "out",
				output: {
					embedding: result.embedding,
					dimensions: result.embedding.length,
				},
			};
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "EMBEDDING_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
