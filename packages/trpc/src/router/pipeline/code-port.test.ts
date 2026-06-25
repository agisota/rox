import { describe, expect, test } from "bun:test";
import {
	CodeExecutionError,
	type CodeExecutionRequest,
} from "@rox/workflow-runtime/handlers";
import { pipelineCodeExecute } from "./code-port";

/**
 * REAL-sandbox coverage for the pipeline `code` port (#526). Unlike the pure
 * handler test (fake port) in `@rox/workflow-runtime`, this exercises the actual
 * `worker_threads` isolate: it proves the sandbox runs real code, hard-kills on
 * timeout, denies host access (process/fetch/require/Function-constructor escape),
 * rejects unsupported languages, and never leaks a non-serializable result.
 *
 * These run a genuine worker, so each is bounded by a small timeout to stay fast.
 */

function req(
	overrides: Partial<CodeExecutionRequest> & { source: string },
): CodeExecutionRequest {
	return {
		language: "javascript",
		input: {},
		timeoutMs: 2_000,
		memoryLimitMb: 64,
		...overrides,
	};
}

describe("pipelineCodeExecute — happy path", () => {
	test("runs main(input) and returns its object value", async () => {
		const res = await pipelineCodeExecute(
			req({
				source: "function main(input){ return { sum: input.a + input.b }; }",
				input: { a: 2, b: 40 },
			}),
		);
		expect(res.value).toEqual({ sum: 42 });
	});

	test("supports async main and awaited work", async () => {
		const res = await pipelineCodeExecute(
			req({
				source:
					"async function main(input){ return { v: await Promise.resolve(input.n + 1) }; }",
				input: { n: 9 },
			}),
		);
		expect(res.value).toEqual({ v: 10 });
	});

	test("captures console output as logs (diagnostics, not the return channel)", async () => {
		const res = await pipelineCodeExecute(
			req({
				source:
					"function main(){ console.log('hello'); console.log('world'); return { ok: true }; }",
			}),
		);
		expect(res.value).toEqual({ ok: true });
		expect(res.logs).toEqual(["hello", "world"]);
	});

	test("typescript source is run as JavaScript", async () => {
		const res = await pipelineCodeExecute(
			req({
				language: "typescript",
				source: "function main(input){ return { doubled: input.n * 2 }; }",
				input: { n: 21 },
			}),
		);
		expect(res.value).toEqual({ doubled: 42 });
	});
});

describe("pipelineCodeExecute — sandbox enforcement (security)", () => {
	test("an infinite loop is hard-killed at the timeout with CODE_TIMEOUT", async () => {
		const start = Date.now();
		await expect(
			pipelineCodeExecute(
				req({ source: "function main(){ while(true){} }", timeoutMs: 400 }),
			),
		).rejects.toMatchObject({ code: "CODE_TIMEOUT" });
		// Proves the kill actually happened near the deadline, not after hanging.
		expect(Date.now() - start).toBeLessThan(3_000);
	});

	test("host process global is denied (undefined in the sandbox)", async () => {
		const res = await pipelineCodeExecute(
			req({ source: "function main(){ return { t: typeof process }; }" }),
		);
		expect(res.value).toEqual({ t: "undefined" });
	});

	test("network globals (fetch / WebSocket) are denied", async () => {
		const res = await pipelineCodeExecute(
			req({
				source:
					"function main(){ return { fetch: typeof fetch, ws: typeof WebSocket }; }",
			}),
		);
		expect(res.value).toEqual({ fetch: "undefined", ws: "undefined" });
	});

	test("require is denied — no module loader / filesystem reach", async () => {
		await expect(
			pipelineCodeExecute(
				req({
					source:
						"function main(){ return require('node:fs').readdirSync('/'); }",
				}),
			),
		).rejects.toMatchObject({ code: "CODE_RUNTIME_ERROR" });
	});

	test("the Function-constructor escape cannot recover process", async () => {
		const res = await pipelineCodeExecute(
			req({
				source:
					"function main(){ try { return { v: (function(){}).constructor('return typeof process')() }; } catch(e){ return { v: 'blocked' }; } }",
			}),
		);
		// process was deleted from the worker global, so even the constructor escape
		// sees `undefined` (it never reaches a live process object).
		expect(res.value).toEqual({ v: "undefined" });
	});

	test("Bun global is denied (no Bun.spawn / Bun.file reach)", async () => {
		const res = await pipelineCodeExecute(
			req({ source: "function main(){ return { t: typeof Bun }; }" }),
		);
		expect(res.value).toEqual({ t: "undefined" });
	});
});

describe("pipelineCodeExecute — typed failures", () => {
	test("python is accepted by config but rejected as unsupported here", async () => {
		await expect(
			pipelineCodeExecute(
				req({ language: "python", source: "def main(i):\n  return i" }),
			),
		).rejects.toMatchObject({ code: "CODE_LANGUAGE_UNSUPPORTED" });
	});

	test("a runtime throw in the source maps to CODE_RUNTIME_ERROR", async () => {
		await expect(
			pipelineCodeExecute(
				req({ source: "function main(){ throw new Error('boom'); }" }),
			),
		).rejects.toMatchObject({ code: "CODE_RUNTIME_ERROR" });
	});

	test("a non-serializable return is rejected, not silently dropped", async () => {
		await expect(
			pipelineCodeExecute(
				req({ source: "function main(){ const o={}; o.self=o; return o; }" }),
			),
		).rejects.toMatchObject({ code: "CODE_OUTPUT_NOT_SERIALIZABLE" });
	});

	test("rejections are CodeExecutionError instances (typed for the handler)", async () => {
		const err = await pipelineCodeExecute(
			req({ language: "python", source: "x" }),
		).catch((e) => e);
		expect(err).toBeInstanceOf(CodeExecutionError);
	});
});
