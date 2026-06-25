import type { BlockHandler, BlockHandlerContext } from "../executor/types";

/**
 * Languages the `code` node accepts in config. The sandbox executor (the injected
 * {@link CodeExecutionPort}) decides which it can actually run; an accepted-but-
 * unrunnable language (e.g. `python` with no interpreter) routes to `error` with a
 * typed code — never a silent wrong result (design: "never a silent wrong result").
 */
export type CodeLanguage = "javascript" | "typescript" | "python";

const CODE_LANGUAGES: ReadonlySet<string> = new Set([
	"javascript",
	"typescript",
	"python",
]);

/** Hard ceiling on author source length (mirrors the registry config schema). */
const MAX_SOURCE_LENGTH = 50_000;

/**
 * Default + hard caps on the sandbox the executor port must enforce. The handler
 * carries them on the request so the cap policy is one shared, testable place; the
 * port is free to clamp further but must never exceed {@link MAX_CODE_TIMEOUT_MS} /
 * {@link MAX_CODE_MEMORY_MB} (it is the security boundary, the handler is the
 * contract).
 */
export const DEFAULT_CODE_TIMEOUT_MS = 5_000;
export const MAX_CODE_TIMEOUT_MS = 30_000;
export const DEFAULT_CODE_MEMORY_MB = 128;
export const MAX_CODE_MEMORY_MB = 512;

/** Clamp a configured timeout into `[1, MAX_CODE_TIMEOUT_MS]` ms, default when unset. */
export function resolveCodeTimeoutMs(raw: unknown): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) {
		return DEFAULT_CODE_TIMEOUT_MS;
	}
	const floored = Math.floor(raw);
	if (floored < 1) return 1;
	if (floored > MAX_CODE_TIMEOUT_MS) return MAX_CODE_TIMEOUT_MS;
	return floored;
}

/** Clamp a configured memory cap into `[8, MAX_CODE_MEMORY_MB]` MB, default when unset. */
export function resolveCodeMemoryMb(raw: unknown): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) {
		return DEFAULT_CODE_MEMORY_MB;
	}
	const floored = Math.floor(raw);
	if (floored < 8) return 8;
	if (floored > MAX_CODE_MEMORY_MB) return MAX_CODE_MEMORY_MB;
	return floored;
}

/**
 * Request handed to the injected code-execution port for a `code` block. Kept
 * runtime-agnostic so `@rox/workflow-runtime` stays sandbox-/SDK-free: the
 * run-service wires the real isolated-worker port (`@rox/trpc`), unit tests inject
 * a fake. The handler has already resolved the named `inputs` against the merged
 * upstream input, so the port runs `source` with a plain, JSON-safe `input` object
 * and NO host access by default (no fs / network / process — see the port).
 */
export interface CodeExecutionRequest {
	/** Source language. The port rejects languages it cannot sandbox. */
	language: CodeLanguage;
	/** Author-supplied source. Convention: define `main(input)` and return a value. */
	source: string;
	/** The resolved, JSON-safe input object exposed to the code as `input`. */
	input: Record<string, unknown>;
	/** Wall-clock budget; the port MUST hard-terminate on overrun. */
	timeoutMs: number;
	/** Heap cap (MB); the port MUST bound worker memory to this. */
	memoryLimitMb: number;
}

/** Result returned by the code-execution port for a `code` block. */
export interface CodeExecutionResult {
	/**
	 * The return value of the executed code. Object returns map onto the node's
	 * `out` payload directly; a non-object return is wrapped as `{ result }` by the
	 * handler so the graph always carries an object downstream.
	 */
	value: unknown;
	/** Best-effort captured stdout lines (never the return channel; diagnostics). */
	logs?: string[];
}

/**
 * Impure code-execution port: runs the (untrusted) source in a resource- and
 * time-bounded sandbox with NO host filesystem/network/process access by default.
 * Injected by the run-service so the executor stays sandbox-free. Implementations
 * MUST enforce {@link CodeExecutionRequest.timeoutMs} (hard kill) and
 * {@link CodeExecutionRequest.memoryLimitMb}, and SHOULD throw a {@link CodeExecutionError}
 * (or any Error) on a sandbox failure — the handler maps that onto the `error` handle.
 */
export type CodeExecutionPort = (
	req: CodeExecutionRequest,
) => Promise<CodeExecutionResult>;

/**
 * Typed sandbox failure the port may throw. `code` lets the handler surface a
 * stable, machine-readable reason (timeout / memory / unsupported language /
 * runtime throw) on the node's `error` handle instead of an opaque message.
 */
export class CodeExecutionError extends Error {
	readonly code: string;
	readonly details?: Record<string, unknown>;
	constructor(
		code: string,
		message: string,
		details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "CodeExecutionError";
		this.code = code;
		if (details) this.details = details;
	}
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Resolve the node's `inputs` map (`name → expression`) against the merged upstream
 * input. SLICE SCOPE: each expression is treated as a key/dotted-path lookup into
 * the upstream input (e.g. `user.email`), matching the model node's `{{path}}`
 * single-scope resolution. An unresolved path yields `undefined` for that name (the
 * sandbox sees the key with an undefined value), never a thrown reference — the
 * cross-node `{{node.field}}` resolver (#550) has already expanded graph refs in the
 * block config before the handler runs. When no `inputs` map is configured, the
 * whole merged input object is forwarded as `input` (the natural default).
 */
export function resolveCodeInputs(
	inputsMap: Record<string, unknown> | undefined,
	upstream: Record<string, unknown>,
): Record<string, unknown> {
	if (inputsMap == null || Object.keys(inputsMap).length === 0) {
		return upstream;
	}
	const resolved: Record<string, unknown> = {};
	for (const [name, expr] of Object.entries(inputsMap)) {
		const path = asString(expr);
		if (path == null || path.trim() === "") {
			resolved[name] = undefined;
			continue;
		}
		resolved[name] = readPath(upstream, path.trim());
	}
	return resolved;
}

/** Walk a dotted path (`a.b.c`) against a record; undefined on any miss. */
function readPath(source: Record<string, unknown>, path: string): unknown {
	let cur: unknown = source;
	for (const key of path.split(".")) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[key];
	}
	return cur;
}

/**
 * Coerce the sandbox return value into the node's `out` object payload. An object
 * (non-array, non-null) passes through as the output map directly; everything else
 * (string/number/array/null/undefined) is wrapped under `result` so the graph always
 * carries an object to downstream nodes. `logs` ride alongside for diagnostics.
 */
export function shapeCodeOutput(
	result: CodeExecutionResult,
): Record<string, unknown> {
	const { value } = result;
	const base: Record<string, unknown> =
		value != null && typeof value === "object" && !Array.isArray(value)
			? { ...(value as Record<string, unknown>) }
			: { result: value ?? null };
	if (result.logs && result.logs.length > 0) base.logs = result.logs;
	return base;
}

/**
 * Build the `code` block handler. Reads the node config from `block.subBlocks`
 * (language, source, inputs map, optional timeout/memory caps), validates the
 * language + source, resolves the named inputs against the merged upstream input,
 * then delegates the actual sandboxed run to the injected {@link CodeExecutionPort}.
 * Returns `{ output }` on the `out` handle for a successful run, or routes a missing
 * config / unsupported language / sandbox failure (timeout, memory, runtime throw)
 * to the `error` handle with a typed code.
 *
 * The handler itself NEVER executes user code — it is pure orchestration over the
 * injected port, so escape attempts, timeouts and memory caps are exercised against
 * the real port (in `@rox/trpc`) while the handler's branching is unit-tested with a
 * fake port.
 */
export function makeCodeHandler(execute: CodeExecutionPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};

		const language = asString(sub.language);
		if (language == null || !CODE_LANGUAGES.has(language)) {
			return {
				handle: "error",
				error: {
					code: "CODE_LANGUAGE_MISSING",
					message:
						"Code node has no (or an unknown) language configured (subBlocks.language must be javascript | typescript | python).",
					blockId: ctx.blockId,
				},
			};
		}

		const source = asString(sub.source);
		if (source == null || source.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "CODE_SOURCE_MISSING",
					message: "Code node has no source configured (subBlocks.source).",
					blockId: ctx.blockId,
				},
			};
		}
		if (source.length > MAX_SOURCE_LENGTH) {
			return {
				handle: "error",
				error: {
					code: "CODE_SOURCE_TOO_LARGE",
					message: `Code node source exceeds the ${MAX_SOURCE_LENGTH}-char limit.`,
					blockId: ctx.blockId,
				},
			};
		}

		const inputsMap =
			sub.inputs != null && typeof sub.inputs === "object"
				? (sub.inputs as Record<string, unknown>)
				: undefined;
		const input = resolveCodeInputs(inputsMap, ctx.input);

		const req: CodeExecutionRequest = {
			language: language as CodeLanguage,
			source,
			input,
			timeoutMs: resolveCodeTimeoutMs(sub.timeoutMs),
			memoryLimitMb: resolveCodeMemoryMb(sub.memoryLimitMb),
		};

		let result: CodeExecutionResult;
		try {
			result = await execute(req);
		} catch (err) {
			if (err instanceof CodeExecutionError) {
				return {
					handle: "error",
					error: {
						code: err.code,
						message: err.message,
						blockId: ctx.blockId,
						...(err.details ? { details: err.details } : {}),
					},
				};
			}
			return {
				handle: "error",
				error: {
					code: "CODE_EXECUTION_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		return { handle: "out", output: shapeCodeOutput(result) };
	};
}
