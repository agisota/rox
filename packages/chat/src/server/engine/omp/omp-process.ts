/**
 * {@link OmpProcess} — a thin, typed client over an `omp --mode rpc` child
 * process (oh-my-pi). It owns the subprocess lifecycle, the JSONL stdin/stdout
 * framing, the `{"type":"ready"}` handshake, request/response correlation by
 * `id`, and a fan-out of push events to subscribers.
 *
 * The mapping from omp RPC frames to Rox's {@link Engine} surface is verified
 * against a live `omp/15.11.0` spike — see the module-level notes in
 * {@link ./omp-engine.ts} for the field-by-field contract. This file deals only
 * with transport; semantic mapping lives in the engine.
 *
 * omp ships as a single compiled binary with the Bun runtime embedded, so it is
 * spawned directly as a child process (the parent may be Node/Electron).
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/** A push event emitted by omp on stdout (everything that is not a `response`). */
export type OmpPushEvent = Record<string, unknown> & { type: string };

/** The envelope omp returns for a correlated request (pull/command). */
interface OmpResponseFrame {
	id: string;
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: unknown;
}

/** Options for spawning the omp child. */
export interface OmpProcessOptions {
	/** omp model id (e.g. `groq/llama-3.3-70b-versatile`). */
	model: string;
	/** Working directory for the child (defaults to the engine cwd). */
	cwd?: string;
	/** Env for the child — provider keys (GROQ_API_KEY, …) live here. */
	env?: NodeJS.ProcessEnv;
	/** Isolated session storage dir so the rpc child never resumes a stale session. */
	sessionDir?: string;
	/** Path to the omp binary. Defaults to `omp` on PATH. */
	binPath?: string;
	/** Extra args appended verbatim (e.g. `--system-prompt`, `--tools`). */
	extraArgs?: string[];
	/** ms to wait for the `ready` frame before rejecting. Default 30000. */
	readyTimeoutMs?: number;
}

type PendingRequest = {
	resolve: (data: unknown) => void;
	reject: (err: Error) => void;
};

/**
 * Owns one `omp --mode rpc` subprocess and exposes a promise-based command API
 * plus a push-event subscription. Stateless beyond transport: it does not
 * interpret frames, it only routes them.
 */
export class OmpProcess {
	private child: ChildProcessWithoutNullStreams | null = null;
	private stdoutBuffer = "";
	private ready = false;
	private readyPromise: Promise<void> | null = null;
	private exited = false;
	private exitError: Error | null = null;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly listeners = new Set<(event: OmpPushEvent) => void>();

	constructor(private readonly options: OmpProcessOptions) {}

	/** True once the child has emitted `{"type":"ready"}` and not yet exited. */
	get isReady(): boolean {
		return this.ready && !this.exited;
	}

	/**
	 * Spawn the child and resolve once it reports `ready`. Idempotent: repeated
	 * calls return the same in-flight/settled promise.
	 */
	start(): Promise<void> {
		if (this.readyPromise) return this.readyPromise;

		const {
			model,
			cwd,
			env,
			sessionDir,
			binPath = "omp",
			extraArgs = [],
			readyTimeoutMs = 30000,
		} = this.options;

		const args = [
			"--mode",
			"rpc",
			// The machine's global omp config can be `yolo`; force approvals so the
			// built-in tool gate surfaces over the rpc channel.
			"--approval-mode",
			"always-ask",
			"--model",
			model,
			...(sessionDir ? ["--session-dir", sessionDir] : []),
			...extraArgs,
		];

		this.readyPromise = new Promise<void>((resolve, reject) => {
			const child = spawn(binPath, args, {
				cwd,
				env: env ?? process.env,
				stdio: ["pipe", "pipe", "pipe"],
			});
			this.child = child;

			const readyTimer = setTimeout(() => {
				reject(
					new Error(
						`omp did not become ready within ${readyTimeoutMs}ms (model=${model})`,
					),
				);
				this.destroy();
			}, readyTimeoutMs);

			const onReady = () => {
				clearTimeout(readyTimer);
				this.ready = true;
				resolve();
			};

			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => this.onStdout(chunk, onReady));
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				// omp logs diagnostics to stderr; keep them off the hot path but
				// available for debugging without leaking into frame parsing.
				if (process.env.OMP_ENGINE_DEBUG) {
					process.stderr.write(`[omp:${model}] ${chunk}`);
				}
			});

			child.on("error", (err) => {
				clearTimeout(readyTimer);
				this.exited = true;
				this.exitError = err;
				this.failAllPending(err);
				reject(err);
			});

			child.on("exit", (code, signal) => {
				clearTimeout(readyTimer);
				this.exited = true;
				const err =
					code === 0 || signal === "SIGTERM" || signal === "SIGKILL"
						? null
						: new Error(`omp exited (code=${code}, signal=${signal})`);
				this.exitError = err;
				this.failAllPending(
					err ?? new Error("omp process exited before responding"),
				);
				if (!this.ready) {
					reject(err ?? new Error("omp exited before ready"));
				}
			});
		});

		return this.readyPromise;
	}

	/** Subscribe to push events. Returns an unsubscribe function. */
	subscribe(listener: (event: OmpPushEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Send a fire-and-forget frame (no correlated response awaited). Used for
	 * `abort`, where omp emits lifecycle events rather than a `response`.
	 */
	notify(type: string, payload: Record<string, unknown> = {}): void {
		this.writeFrame({ id: randomUUID(), type, ...payload });
	}

	/**
	 * Send a frame and await its correlated `{type:"response"}` by `id`. Used for
	 * `prompt`, `get_state`, `get_messages`, and `extension_ui_response`-less
	 * commands. Rejects if the child exits first or returns `success:false`.
	 */
	request<T = unknown>(
		type: string,
		payload: Record<string, unknown> = {},
		timeoutMs = 60000,
	): Promise<T> {
		if (this.exited) {
			return Promise.reject(
				this.exitError ?? new Error("omp process is not running"),
			);
		}
		const id = randomUUID();
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(`omp command "${type}" timed out after ${timeoutMs}ms`),
				);
			}, timeoutMs);

			this.pending.set(id, {
				resolve: (data) => {
					clearTimeout(timer);
					resolve(data as T);
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
			});
			this.writeFrame({ id, type, ...payload });
		});
	}

	/**
	 * Answer a blocking `extension_ui_request` by correlated `id`. Fire-and-forget:
	 * omp resumes the suspended turn; it does not send a `response` envelope.
	 */
	respondToExtensionUi(id: string, value: unknown): void {
		this.writeFrame({ type: "extension_ui_response", id, value });
	}

	/** Terminate the child and reject any in-flight requests. */
	destroy(): void {
		const child = this.child;
		this.child = null;
		this.ready = false;
		this.exited = true;
		this.failAllPending(new Error("omp process destroyed"));
		this.listeners.clear();
		if (child && !child.killed) {
			child.kill("SIGTERM");
			// Hard-kill if it lingers.
			setTimeout(() => {
				if (!child.killed) child.kill("SIGKILL");
			}, 2000).unref?.();
		}
	}

	private writeFrame(frame: Record<string, unknown>): void {
		if (!this.child || this.exited) {
			throw this.exitError ?? new Error("omp process is not running");
		}
		this.child.stdin.write(`${JSON.stringify(frame)}\n`);
	}

	private onStdout(chunk: string, onReady: () => void): void {
		this.stdoutBuffer += chunk;
		let newlineIndex = this.stdoutBuffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
			this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
			if (line) this.handleLine(line, onReady);
			newlineIndex = this.stdoutBuffer.indexOf("\n");
		}
	}

	private handleLine(line: string, onReady: () => void): void {
		let frame: { type?: string; [key: string]: unknown };
		try {
			frame = JSON.parse(line);
		} catch {
			// Non-JSON stdout noise — ignore.
			return;
		}

		if (frame.type === "response") {
			this.handleResponse(frame as unknown as OmpResponseFrame);
			return;
		}

		if (frame.type === "ready") {
			onReady();
			// `ready` is also forwarded so the engine can observe it if needed.
		}

		this.emit(frame as OmpPushEvent);
	}

	private handleResponse(frame: OmpResponseFrame): void {
		const pending = this.pending.get(frame.id);
		if (!pending) return;
		this.pending.delete(frame.id);
		if (frame.success) {
			pending.resolve(frame.data);
		} else {
			pending.reject(
				new Error(
					`omp command "${frame.command}" failed: ${
						typeof frame.error === "string"
							? frame.error
							: JSON.stringify(frame.error ?? "unknown error")
					}`,
				),
			);
		}
	}

	private emit(event: OmpPushEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (err) {
				if (process.env.OMP_ENGINE_DEBUG) {
					console.error("[omp] listener error", err);
				}
			}
		}
	}

	private failAllPending(err: Error): void {
		for (const pending of this.pending.values()) {
			pending.reject(err);
		}
		this.pending.clear();
	}
}
