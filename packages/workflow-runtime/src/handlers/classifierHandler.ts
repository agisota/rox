import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * Request handed to the injected classification port for a `classifier` block.
 * Kept provider-agnostic so `@rox/workflow-runtime` stays SDK-free: the
 * run-service wires the real LLM provider (see `@rox/trpc` pipeline handlers),
 * unit tests inject a fake.
 */
export interface ClassifyRequest {
	/** The text being classified (placeholders already expanded). */
	text: string;
	/** The candidate labels the model must choose exactly one of. */
	labels: string[];
	/** Optional extra instruction for the classifier (e.g. domain context). */
	instruction?: string;
	/** Model id from the node config (`subBlocks.model`), provider-specific. */
	model?: string;
}

export interface ClassifyResult {
	/** The chosen label. MUST be one of the request `labels`. */
	label: string;
	/** Confidence in `[0, 1]`, when the provider exposes one. */
	score?: number;
}

/**
 * Impure zero-shot classification port: resolves credentials + calls the LLM.
 * Injected by the run-service so the executor stays DB/SDK-free (mirrors
 * {@link import("./modelHandler").ModelGeneratePort}). The run-service implements
 * this by reusing the pipeline model provider — no new LLM client.
 */
export type ClassifyPort = (req: ClassifyRequest) => Promise<ClassifyResult>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Normalize the authored `subBlocks.labels` into a clean string list. Tolerant
 * of jsonb shape: accepts an array of strings or `{ label }`/`{ value }` objects;
 * drops blanks and de-dupes while preserving authored order.
 */
export function parseLabels(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const entry of raw) {
		const label =
			asString(entry) ??
			(entry != null && typeof entry === "object"
				? (asString((entry as Record<string, unknown>).label) ??
					asString((entry as Record<string, unknown>).value))
				: undefined);
		if (label == null) continue;
		const trimmed = label.trim();
		if (trimmed === "" || seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(trimmed);
	}
	return out;
}

/**
 * Resolve the text to classify. Prefers the node's own configured `text`
 * (`subBlocks.text`/`input`), with `{{path}}` placeholders expanded from the
 * merged upstream input (same lightweight resolver the `model` node uses); falls
 * back to the merged input's `text` field. Returns `undefined` when neither
 * yields a non-empty string.
 */
function resolveText(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): string | undefined {
	const configured = asString(sub.text) ?? asString(sub.input);
	if (configured != null && configured.trim() !== "") {
		const expanded = resolvePromptTemplate(configured, input).trim();
		if (expanded !== "") return expanded;
	}
	const fromInput = asString(input.text);
	if (fromInput != null && fromInput.trim() !== "") return fromInput.trim();
	return undefined;
}

/**
 * Turn a chosen label into a safe per-label output handle id so authors can wire
 * dynamic per-class edges (`subBlocks.labels`). Lowercased, non-alphanumerics
 * collapsed to `_`. The canonical `out` handle still fires alongside as the
 * default, so a pipeline that does not wire per-label edges keeps working.
 */
export function labelToHandle(label: string): string {
	const slug = label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return slug === "" ? "out" : `class:${slug}`;
}

/**
 * Build the `classifier` block handler. Reads the candidate labels and the text
 * to classify from the node config / merged upstream input, then delegates the
 * zero-shot classification to the injected {@link ClassifyPort}. On success it
 * fires the per-label handle (`class:<label>`) so authors can branch by class,
 * with `{ label, score }` on the output (also readable via the canonical `out`
 * edge). A missing label list, missing text, an out-of-set label from the
 * provider, or a provider error all route to the `error` handle.
 */
export function makeClassifierHandler(classify: ClassifyPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const labels = parseLabels(sub.labels);
		const instruction = asString(sub.instruction) ?? asString(sub.prompt);
		const model = asString(sub.model);

		if (labels.length === 0) {
			return {
				handle: "error",
				error: {
					code: "CLASSIFIER_LABELS_MISSING",
					message:
						"Classifier node has no labels configured (subBlocks.labels).",
					blockId: ctx.blockId,
				},
			};
		}

		const text = resolveText(sub, ctx.input);
		if (text == null) {
			return {
				handle: "error",
				error: {
					code: "CLASSIFIER_TEXT_MISSING",
					message:
						"Classifier node has no text configured (subBlocks.text) and no upstream `text` input.",
					blockId: ctx.blockId,
				},
			};
		}

		let result: ClassifyResult;
		try {
			result = await classify({ text, labels, instruction, model });
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "CLASSIFIER_CALL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		if (!labels.includes(result.label)) {
			return {
				handle: "error",
				error: {
					code: "CLASSIFIER_LABEL_OUT_OF_SET",
					message: `Classifier returned "${result.label}", which is not one of the configured labels.`,
					blockId: ctx.blockId,
				},
			};
		}

		return {
			handle: labelToHandle(result.label),
			output: {
				label: result.label,
				score: result.score,
				labels,
			},
		};
	};
}
