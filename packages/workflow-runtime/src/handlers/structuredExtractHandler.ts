import type { JsonSchema, WorkflowIssue } from "@rox/workflow-core";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * Request handed to the injected structured-extraction port for a
 * `structured_extract` block. Kept provider-agnostic so `@rox/workflow-runtime`
 * stays SDK-free: the run-service wires the real LLM provider (see `@rox/trpc`
 * pipeline handlers, reusing the pipeline model provider in forced-JSON mode),
 * unit tests inject a fake.
 */
export interface StructuredExtractRequest {
	/** Resolved instruction prompt (placeholders already expanded). */
	prompt: string;
	/**
	 * The JSON schema the extraction must satisfy, forwarded to the provider so it
	 * can shape the JSON output. The handler ALSO validates the returned value
	 * against this schema — the provider hint is not trusted on its own.
	 */
	schema: JsonSchema;
	/** Model id from the node config (`subBlocks.model`), provider-specific. */
	model?: string;
}

export interface StructuredExtractResult {
	/** The parsed JSON value the provider produced (forced JSON mode). */
	object: unknown;
}

/**
 * Impure structured-extraction port: resolves credentials + calls the LLM in
 * forced-JSON mode. Injected by the run-service so the executor stays DB/SDK-free
 * (mirrors {@link import("./modelHandler").ModelGeneratePort}).
 */
export type StructuredExtractPort = (
	req: StructuredExtractRequest,
) => Promise<StructuredExtractResult>;

/**
 * Schema validator injected into the handler. The run-service wires this to
 * `@rox/workflow-core`'s `validateOutput` so the handler reuses the canonical
 * JSON-schema validator without the runtime barrel taking a runtime dependency
 * on workflow-core (keeps the cycle-safe `handlers` subpath type-only). Returns
 * one issue per violation; an empty array means valid.
 */
export type SchemaValidator = (
	value: unknown,
	schema: JsonSchema,
) => WorkflowIssue[];

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve the JSON schema the extraction must satisfy from the node config.
 * Accepts the schema object directly (`subBlocks.schema`) or a JSON string
 * (jsonb authoring tolerance). Returns `undefined` when nothing usable is set.
 */
export function resolveSchema(
	sub: Record<string, unknown>,
): JsonSchema | undefined {
	const raw = sub.schema;
	if (isRecord(raw)) return raw as JsonSchema;
	if (typeof raw === "string" && raw.trim() !== "") {
		try {
			const parsed = JSON.parse(raw);
			return isRecord(parsed) ? (parsed as JsonSchema) : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

/**
 * Resolve the extraction instruction. Prefers the node's own configured prompt
 * (`subBlocks.prompt`/`instruction`), with `{{path}}` placeholders expanded from
 * the merged upstream input; falls back to the merged input's `text` field so an
 * upstream node's text can be extracted directly. Returns `undefined` when
 * neither yields a non-empty string.
 */
function resolvePrompt(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): string | undefined {
	const configured = asString(sub.prompt) ?? asString(sub.instruction);
	if (configured != null && configured.trim() !== "") {
		const expanded = resolvePromptTemplate(configured, input).trim();
		if (expanded !== "") return expanded;
	}
	const fromInput = asString(input.text);
	if (fromInput != null && fromInput.trim() !== "") return fromInput.trim();
	return undefined;
}

/**
 * Build the `structured_extract` block handler. Reads the JSON schema + the
 * extraction prompt from the node config / merged upstream input, delegates the
 * forced-JSON LLM call to the injected {@link StructuredExtractPort}, then
 * validates the returned value against the schema via the injected
 * {@link SchemaValidator} (the run-service wires `@rox/workflow-core`'s
 * `validateOutput`). Valid data fires `out` with `{ data }`; a missing schema,
 * missing prompt, provider error, or any schema violation routes to the `error`
 * handle — invalid output is never passed downstream.
 */
export function makeStructuredExtractHandler(
	extract: StructuredExtractPort,
	validate: SchemaValidator,
): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const schema = resolveSchema(sub);
		const model = asString(sub.model);

		if (schema == null) {
			return {
				handle: "error",
				error: {
					code: "STRUCTURED_EXTRACT_SCHEMA_MISSING",
					message:
						"Structured Extract node has no JSON schema configured (subBlocks.schema).",
					blockId: ctx.blockId,
				},
			};
		}

		const prompt = resolvePrompt(sub, ctx.input);
		if (prompt == null) {
			return {
				handle: "error",
				error: {
					code: "STRUCTURED_EXTRACT_PROMPT_MISSING",
					message:
						"Structured Extract node has no prompt configured (subBlocks.prompt) and no upstream `text` input.",
					blockId: ctx.blockId,
				},
			};
		}

		let result: StructuredExtractResult;
		try {
			result = await extract({ prompt, schema, model });
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "STRUCTURED_EXTRACT_CALL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		const issues = validate(result.object, schema);
		if (issues.length > 0) {
			const summary = issues
				.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
				.join("; ");
			return {
				handle: "error",
				error: {
					code: "STRUCTURED_EXTRACT_SCHEMA_VALIDATION_FAILED",
					message: `Extracted data failed schema validation: ${summary}`,
					blockId: ctx.blockId,
				},
			};
		}

		return {
			handle: "out",
			output: { data: result.object },
		};
	};
}
