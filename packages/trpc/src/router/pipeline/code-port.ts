import { Worker } from "node:worker_threads";
import {
	CodeExecutionError,
	type CodeExecutionRequest,
	type CodeExecutionResult,
	MAX_CODE_MEMORY_MB,
	MAX_CODE_TIMEOUT_MS,
} from "@rox/workflow-runtime/handlers";

/**
 * Real sandbox port for the pipeline `code` block. Lives here (not in
 * `@rox/workflow-runtime`) so the executor stays sandbox-/worker-free — the runtime
 * only sees the injected port.
 *
 * SECURITY MODEL (issue #526). Author code is UNTRUSTED. It runs in a dedicated
 * `node:worker_threads` Worker — a separate JS realm with its own heap and event
 * loop — so a hostile or runaway script cannot reach the API process state. The
 * worker is hardened on three axes:
 *
 *   1. DENY HOST ACCESS BY DEFAULT. Before user code runs, the worker bootstrap
 *      deletes the host-reaching globals (`process`, `require`, `module`, `Bun`,
 *      `fetch`, `XMLHttpRequest`, `WebSocket`, `__dirname`, `__filename`,
 *      `globalThis`/`global`) AND shadows each as an `undefined` parameter of the
 *      function wrapping the source. So the script has no filesystem, no network,
 *      no child-process, and no module loader — even via the `Function`-constructor
 *      escape (the constructor's `return process` sees the deleted global). Any
 *      future opt-in (e.g. a whitelisted fetch) must be added explicitly + audited;
 *      none is granted here.
 *   2. TIMEOUT (hard kill). A watchdog `worker.terminate()`s the worker when the
 *      configured `timeoutMs` elapses, so an infinite loop cannot wedge the run.
 *   3. MEMORY CAP. The worker is created with V8 `resourceLimits` bounding its old/
 *      young generation heap; a script that allocates past the cap dies with the
 *      worker (surfaced as a typed `CODE_MEMORY_LIMIT`/`CODE_WORKER_EXIT`).
 *
 * The worker is created with `eval: true` from an inline bootstrap string (no extra
 * file to bundle/ship) and communicates one request/one reply over the parent port.
 * Python is accepted at the config layer but is NOT runnable here (no interpreter is
 * assumed on the host) — it returns a typed `CODE_LANGUAGE_UNSUPPORTED` error rather
 * than ever silently producing a wrong result.
 */

/** Languages this host can actually sandbox. TS is run as JS (type-strip is a
 * later slice; the worker evaluates the source as JavaScript). */
const RUNNABLE: ReadonlySet<string> = new Set(["javascript", "typescript"]);

/**
 * Host-reaching globals removed from + shadowed in the worker scope before user
 * code runs. Kept in one place so the deny-list is auditable.
 */
const BANNED_GLOBALS = [
	"process",
	"require",
	"module",
	"exports",
	"Bun",
	"fetch",
	"XMLHttpRequest",
	"WebSocket",
	"__dirname",
	"__filename",
	"global",
	"globalThis",
] as const;

/**
 * The worker bootstrap. Runs INSIDE the isolated worker. It hardens the global
 * scope (delete + nullify the banned globals), then wraps the author source in a
 * function whose parameter list shadows every banned identifier with `undefined`
 * and exposes the resolved `input`. The convention: the source defines `main(input)`
 * and returns a value; a bare expression body that defines `main` is supported, and
 * when no `main` is defined the script's own return (if any) is used. Exactly one
 * `{ ok, value | error }` message is posted back.
 */
const WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require("node:worker_threads");
const BANNED = ${JSON.stringify(BANNED_GLOBALS)};
for (const k of BANNED) {
	try { delete globalThis[k]; } catch (_) {}
	try { globalThis[k] = undefined; } catch (_) {}
}
const logs = [];
const sandboxConsole = {
	log: (...a) => { try { logs.push(a.map(String).join(" ")); } catch (_) {} },
	info: (...a) => { try { logs.push(a.map(String).join(" ")); } catch (_) {} },
	warn: (...a) => { try { logs.push(a.map(String).join(" ")); } catch (_) {} },
	error: (...a) => { try { logs.push(a.map(String).join(" ")); } catch (_) {} },
};
(async () => {
	try {
		const params = BANNED.concat(["console", "input"]);
		const body = workerData.source +
			"\\n;return (typeof main === 'function') ? main(input) : undefined;";
		// eslint-disable-next-line no-new-func
		const fn = new Function(...params, body);
		const args = BANNED.map(() => undefined).concat([sandboxConsole, workerData.input]);
		const value = await fn(...args);
		let safe;
		try {
			// Force a JSON-safe boundary: the value must survive structured transfer.
			safe = JSON.parse(JSON.stringify(value === undefined ? null : value));
		} catch (_) {
			parentPort.postMessage({ ok: false, code: "CODE_OUTPUT_NOT_SERIALIZABLE", error: "Code return value is not JSON-serializable." });
			return;
		}
		parentPort.postMessage({ ok: true, value: safe, logs: logs.slice(0, 100) });
	} catch (e) {
		parentPort.postMessage({ ok: false, code: "CODE_RUNTIME_ERROR", error: String((e && e.message) || e) });
	}
})();
`;

interface WorkerOk {
	ok: true;
	value: unknown;
	logs?: string[];
}
interface WorkerErr {
	ok: false;
	code: string;
	error: string;
}
type WorkerReply = WorkerOk | WorkerErr;

/**
 * The real {@link CodeExecutionPort}. Spawns a hardened, resource-bounded worker,
 * sends it the request, and resolves with the captured value — or rejects with a
 * typed {@link CodeExecutionError} on timeout, memory death, a runtime throw, a
 * non-serializable result, or an unsupported language.
 */
export async function pipelineCodeExecute(
	req: CodeExecutionRequest,
): Promise<CodeExecutionResult> {
	if (!RUNNABLE.has(req.language)) {
		throw new CodeExecutionError(
			"CODE_LANGUAGE_UNSUPPORTED",
			`Code language "${req.language}" is not runnable in the pipeline sandbox on this host.`,
			{ language: req.language },
		);
	}

	// Defense in depth: never exceed the runtime's hard ceilings even if a caller
	// hands an over-large cap (the handler already clamps, this is the boundary).
	const timeoutMs = Math.min(Math.max(1, req.timeoutMs), MAX_CODE_TIMEOUT_MS);
	const memoryLimitMb = Math.min(
		Math.max(8, req.memoryLimitMb),
		MAX_CODE_MEMORY_MB,
	);

	return await new Promise<CodeExecutionResult>((resolve, reject) => {
		let settled = false;
		const worker = new Worker(WORKER_BOOTSTRAP, {
			eval: true,
			workerData: { source: req.source, input: req.input },
			// V8 heap caps. A script allocating past these dies with the worker; the
			// `exit` handler maps the non-zero exit to a typed memory/exit error.
			resourceLimits: {
				maxOldGenerationSizeMb: memoryLimitMb,
				maxYoungGenerationSizeMb: Math.min(32, Math.ceil(memoryLimitMb / 4)),
			},
			// Block stdio inheritance — the sandbox must not write to the host streams.
			stdout: true,
			stderr: true,
		});

		const finish = (fn: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// Always reap the worker; terminate is idempotent after a normal exit.
			void worker.terminate();
			fn();
		};

		const timer = setTimeout(() => {
			finish(() =>
				reject(
					new CodeExecutionError(
						"CODE_TIMEOUT",
						`Code execution exceeded the ${timeoutMs}ms time limit and was terminated.`,
						{ timeoutMs },
					),
				),
			);
		}, timeoutMs);

		worker.on("message", (msg: WorkerReply) => {
			if (msg.ok) {
				finish(() =>
					resolve({
						value: msg.value,
						...(msg.logs && msg.logs.length > 0 ? { logs: msg.logs } : {}),
					}),
				);
			} else {
				finish(() => reject(new CodeExecutionError(msg.code, msg.error)));
			}
		});

		worker.on("error", (err) => {
			finish(() =>
				reject(
					new CodeExecutionError(
						"CODE_WORKER_ERROR",
						err instanceof Error ? err.message : String(err),
					),
				),
			);
		});

		worker.on("exit", (code) => {
			// A non-zero exit BEFORE a message means the worker died without replying —
			// the typical signature of hitting the memory cap (V8 aborts the isolate).
			if (code !== 0) {
				finish(() =>
					reject(
						new CodeExecutionError(
							"CODE_WORKER_EXIT",
							`Code sandbox worker exited abnormally (code ${code}); likely the ${memoryLimitMb}MB memory limit or a fatal error.`,
							{ exitCode: code, memoryLimitMb },
						),
					),
				);
			}
		});
	});
}
