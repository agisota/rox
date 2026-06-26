/**
 * Transcribe-worker DISPATCHER (production deploy topology).
 *
 * One transcribe-worker process streams exactly ONE room (`index.ts` `main(roomName)`).
 * In production we must cover EVERY active org voice room and follow rooms as they
 * open/close. This module is that supervisor: it polls the LiveKit server for the
 * live room list and reconciles it against the set of worker child processes it is
 * running — spawning a child for each newly-active voice room and reaping a child
 * when its room disappears (or when the child exits), restarting with backoff while
 * the room is still active.
 *
 *   ┌──────────────── runDispatcher(env) ────────────────┐
 *   │  RoomServiceClient.listRooms()  (poll ~10s)         │
 *   │            │ active room names                      │
 *   │            ▼                                         │
 *   │   reconcileRooms(active, running)  (PURE)           │
 *   │        │ toSpawn          │ toKill                  │
 *   │        ▼                  ▼                          │
 *   │  spawn child:        SIGTERM child                  │
 *   │   tsx src/index.ts <room>                           │
 *   │   (Node runtime, inherited env)                     │
 *   │        │                                            │
 *   │        ▼ child exit -> reap; restart (backoff)      │
 *   │          if room still active                       │
 *   └────────────────────────────────────────────────────┘
 *
 * RUNTIME CHOICE — the children MUST run on NODE, not Bun: `@deepgram/sdk@5.4.0`'s
 * realtime websocket sets `ws` `binaryType = "blob"`, which Bun's WebSocket rejects;
 * `@livekit/rtc-node`'s native FFI is a Node addon. We spawn `tsx src/index.ts <room>`
 * (tsx = esbuild loader on Node) because plain `node` fails on this worker's
 * extensionless TS ESM imports while tsx resolves them. The dispatcher itself runs
 * under the same Node/tsx runtime (`package.json` `dispatch` script).
 *
 * SECURITY: the LiveKit API key/secret are used ONLY to build the RoomServiceClient
 * (to sign its API calls) and are NEVER logged. Child processes inherit the parent
 * env so the Deepgram/ingest secrets reach the worker without ever being printed.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readConfigFromEnv, type TranscribeWorkerConfig } from "./config";

// ───────────────────────────── room-name policy ──────────────────────────────

/**
 * Org voice rooms the dispatcher manages: `org:<org>:voice:<channelId>`. This is the
 * EXACT shape `index.ts` documents for `main(roomName)` and that the live e2e proof
 * exercised. Any other LiveKit room (agent rooms, test rooms, etc.) is ignored so a
 * stray room never spawns a transcribe-worker.
 */
export const VOICE_ROOM_PATTERN = /^org:([^:]+):voice:/;

/** True when a room name is an org voice room this dispatcher should transcribe. */
export function isVoiceRoom(roomName: string): boolean {
	return VOICE_ROOM_PATTERN.test(roomName);
}

// ───────────────────────────── pure reconcile ────────────────────────────────

/** The diff a reconcile pass produces: rooms to start, rooms to stop. */
export interface ReconcilePlan {
	/** Active voice rooms with no running worker — spawn one each. */
	toSpawn: string[];
	/** Running workers whose room is gone — kill each. */
	toKill: string[];
}

/**
 * PURE reconcile: diff the active voice rooms against the currently-running workers.
 *
 *  - `toSpawn` = active voice rooms that have NO running worker (new rooms).
 *  - `toKill`  = running workers whose room is no longer active (ended rooms).
 *
 * ONLY rooms matching {@link VOICE_ROOM_PATTERN} are considered: non-voice active
 * rooms never produce a spawn, and a running name that is not a voice room is never
 * killed by this diff (the supervisor only ever runs voice-room children, so this is
 * defensive). Inputs are de-duplicated; outputs are sorted for deterministic logs
 * and tests. No I/O, no side effects — this is the unit-tested core.
 */
export function reconcileRooms(
	activeRoomNames: string[],
	runningRoomNames: string[],
): ReconcilePlan {
	const activeVoice = new Set(activeRoomNames.filter(isVoiceRoom));
	const runningVoice = new Set(runningRoomNames.filter(isVoiceRoom));

	const toSpawn: string[] = [];
	for (const room of activeVoice) {
		if (!runningVoice.has(room)) toSpawn.push(room);
	}

	const toKill: string[] = [];
	for (const room of runningVoice) {
		if (!activeVoice.has(room)) toKill.push(room);
	}

	toSpawn.sort();
	toKill.sort();
	return { toSpawn, toKill };
}

// ───────────────────────────── runtime supervisor ────────────────────────────

/** Structured logger the supervisor uses; NEVER receives secret values. */
export type DispatcherLogger = Pick<Console, "info" | "warn" | "error">;

/** A spawn function (injectable so the supervisor is testable without real procs). */
export type SpawnWorker = (roomName: string) => ChildProcess;

export interface RunDispatcherOptions {
	/** Poll interval for `listRooms()` in ms (default 10_000). */
	pollIntervalMs?: number;
	/** Base restart backoff in ms after a child exits while its room is active. */
	restartBackoffMs?: number;
	/** Structured logger; defaults to console. Never receives secrets. */
	logger?: DispatcherLogger;
	/**
	 * Lists currently-active room names. Defaults to a real LiveKit
	 * `RoomServiceClient.listRooms()`. Injectable for tests.
	 */
	listActiveRooms?: () => Promise<string[]>;
	/**
	 * Spawns ONE worker child for a room. Defaults to `tsx src/index.ts <room>` on
	 * Node with the parent env inherited. Injectable for tests.
	 */
	spawnWorker?: SpawnWorker;
}

/** Running state for one supervised worker child. */
interface RunningChild {
	roomName: string;
	child: ChildProcess;
	/** Set when the supervisor is intentionally killing this child (room gone / shutdown). */
	stopping: boolean;
	/** Consecutive crash restarts, for exponential-ish backoff. */
	restarts: number;
	/** Pending restart timer, so shutdown can cancel it. */
	restartTimer?: ReturnType<typeof setTimeout>;
}

/** Convert the LiveKit ws(s) URL into the https(s) host a RoomServiceClient needs. */
export function livekitHttpHost(wsUrl: string): string {
	// wss:// -> https://, ws:// -> http://. Any already-http(s) url passes through.
	if (wsUrl.startsWith("wss://"))
		return `https://${wsUrl.slice("wss://".length)}`;
	if (wsUrl.startsWith("ws://")) return `http://${wsUrl.slice("ws://".length)}`;
	return wsUrl;
}

/**
 * Build the default `listActiveRooms` backed by a real LiveKit `RoomServiceClient`.
 * The key/secret sign the Twirp API calls and are never logged. Returns the active
 * room NAMES only.
 */
function defaultListActiveRooms(
	config: TranscribeWorkerConfig,
): () => Promise<string[]> {
	// Imported lazily so importing this module (and its tests) never constructs a
	// client / opens a socket; only an actual run does.
	let clientPromise: Promise<{
		listRooms: () => Promise<Array<{ name: string }>>;
	}> | null = null;
	const client = async () => {
		if (!clientPromise) {
			clientPromise = (async () => {
				const { RoomServiceClient } = await import("livekit-server-sdk");
				return new RoomServiceClient(
					livekitHttpHost(config.livekit.url),
					config.livekit.apiKey,
					config.livekit.apiSecret,
				);
			})();
		}
		return clientPromise;
	};
	return async () => {
		const svc = await client();
		const rooms = await svc.listRooms();
		return rooms.map((r) => r.name);
	};
}

/** Absolute path to this worker's single-room entry (`src/index.ts`). */
function workerEntryPath(): string {
	// dispatch.ts and index.ts are siblings in src/.
	const here = fileURLToPath(import.meta.url);
	return here.replace(/dispatch\.ts$/, "index.ts");
}

/**
 * Default child spawn: run the single-room worker on NODE via `tsx`, inheriting the
 * parent env (so DEEPGRAM_API_KEY / LIVEKIT_* / ROX_API_URL / TRANSCRIBE_INGEST_SECRET
 * reach the child without ever being logged). stdio is inherited so child logs stream
 * to the dispatcher's stdout/stderr. Uses `tsx` from node_modules/.bin via the local
 * resolver so it works the same in the Docker image and locally.
 */
function defaultSpawnWorker(logger: DispatcherLogger): SpawnWorker {
	const entry = workerEntryPath();
	return (roomName: string): ChildProcess => {
		// `tsx` is a devDep/dep resolved from node_modules/.bin; spawning it through
		// the shell-free `npx --no-install` keeps a single resolution path in prod.
		const child = spawn("npx", ["--no-install", "tsx", entry, roomName], {
			stdio: "inherit",
			env: process.env,
		});
		child.on("error", (err) => {
			logger.error(
				`dispatcher: failed to spawn worker for ${roomName}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		});
		return child;
	};
}

/** A handle to a running dispatcher; `stop()` tears down the loop + all children. */
export interface DispatcherHandle {
	/** Resolves when the dispatcher has fully stopped (loop ended, children reaped). */
	done: Promise<void>;
	/** Stop polling, kill every child, and resolve `done`. Idempotent. */
	stop(signal?: NodeJS.Signals): Promise<void>;
}

/**
 * Run the per-room dispatcher: poll LiveKit for active voice rooms every
 * `pollIntervalMs`, reconcile against running children, spawn a worker per new room,
 * and reap a child when its room ends or the child exits (restart with backoff while
 * the room is still active). Installs SIGTERM/SIGINT handlers that kill all children
 * and close. Returns a handle whose `done` resolves on shutdown.
 *
 * The poll uses {@link reconcileRooms} for the diff, so the spawn/kill decision is the
 * exact pure function under test. All LiveKit/process I/O is injectable.
 */
export function runDispatcher(
	env: Record<string, string | undefined> = process.env,
	options: RunDispatcherOptions = {},
): DispatcherHandle {
	const config = readConfigFromEnv(env);
	const logger = options.logger ?? console;
	const pollIntervalMs = options.pollIntervalMs ?? 10_000;
	const restartBackoffMs = options.restartBackoffMs ?? 1_000;
	const listActiveRooms =
		options.listActiveRooms ?? defaultListActiveRooms(config);
	const spawnWorker = options.spawnWorker ?? defaultSpawnWorker(logger);

	const running = new Map<string, RunningChild>();
	let shuttingDown = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});

	/** Wire a freshly-spawned child: on exit, reap and (if the room persists) restart. */
	const superviseChild = (entry: RunningChild): void => {
		entry.child.on("exit", (code, signal) => {
			// Drop it from the running map first so a reconcile won't double-count it.
			if (running.get(entry.roomName) === entry) running.delete(entry.roomName);

			if (entry.stopping || shuttingDown) {
				logger.info(
					`dispatcher: worker exited room=${entry.roomName} code=${code ?? "null"} signal=${signal ?? "null"} (reaped)`,
				);
				return;
			}
			// Unexpected exit while the room is presumably still active: restart with a
			// linear-capped backoff. The next poll will also re-spawn if still active;
			// the backoff timer covers the gap between polls so a crash-looping room
			// does not hammer spawn.
			const restarts = entry.restarts + 1;
			const backoff = Math.min(restartBackoffMs * restarts, 30_000);
			logger.warn(
				`dispatcher: worker exited room=${entry.roomName} code=${code ?? "null"} signal=${signal ?? "null"} — restarting in ${backoff}ms (attempt ${restarts})`,
			);
			const timer = setTimeout(() => {
				if (shuttingDown) return;
				// Only restart if nothing else already re-spawned this room.
				if (running.has(entry.roomName)) return;
				spawnFor(entry.roomName, restarts);
			}, backoff);
			// Don't keep the event loop alive solely for a restart timer.
			timer.unref?.();
		});
	};

	/** Spawn a worker for a room and register it as running. */
	const spawnFor = (roomName: string, restarts = 0): void => {
		const child = spawnWorker(roomName);
		const entry: RunningChild = {
			roomName,
			child,
			stopping: false,
			restarts,
		};
		running.set(roomName, entry);
		superviseChild(entry);
		logger.info(
			`dispatcher: worker spawned room=${roomName} pid=${child.pid ?? "?"}${
				restarts > 0 ? ` (restart ${restarts})` : ""
			}`,
		);
	};

	/** Kill the worker for a room (room ended): mark stopping + SIGTERM. */
	const killFor = (roomName: string): void => {
		const entry = running.get(roomName);
		if (!entry) return;
		entry.stopping = true;
		if (entry.restartTimer) clearTimeout(entry.restartTimer);
		logger.info(`dispatcher: room ended room=${roomName} — killing worker`);
		entry.child.kill("SIGTERM");
	};

	/** One reconcile pass: list active rooms, diff, apply spawns + kills. */
	const tick = async (): Promise<void> => {
		let active: string[];
		try {
			active = await listActiveRooms();
		} catch (err) {
			logger.error(
				`dispatcher: listRooms failed: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			return; // transient; next poll retries.
		}
		const plan = reconcileRooms(active, [...running.keys()]);
		for (const room of plan.toSpawn) {
			if (!running.has(room)) spawnFor(room);
		}
		for (const room of plan.toKill) {
			killFor(room);
		}
	};

	// ── poll loop ──
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	const startLoop = async () => {
		logger.info(
			`dispatcher: starting — host=${livekitHttpHost(config.livekit.url)} poll=${pollIntervalMs}ms model=${config.model} language=${config.language}`,
		);
		await tick(); // immediate first pass so workers come up without waiting a poll.
		pollTimer = setInterval(() => {
			void tick();
		}, pollIntervalMs);
		pollTimer.unref?.();
	};

	// ── shutdown ──
	const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
		if (shuttingDown) return done;
		shuttingDown = true;
		logger.info(`dispatcher: ${signal} — shutting down, killing all workers`);
		if (pollTimer) clearInterval(pollTimer);
		const children = [...running.values()];
		const exits: Array<Promise<void>> = [];
		for (const entry of children) {
			entry.stopping = true;
			if (entry.restartTimer) clearTimeout(entry.restartTimer);
			if (entry.child.exitCode === null && entry.child.signalCode === null) {
				exits.push(
					new Promise<void>((resolve) => {
						entry.child.once("exit", () => resolve());
					}),
				);
				entry.child.kill(signal);
			}
		}
		running.clear();
		// Give children a moment to exit; resolve regardless after a grace window.
		await Promise.race([
			Promise.all(exits),
			new Promise<void>((resolve) => {
				const t = setTimeout(resolve, 5_000);
				t.unref?.();
			}),
		]);
		logger.info("dispatcher: shutdown complete");
		resolveDone();
		return done;
	};

	const onSignal = (signal: NodeJS.Signals) => {
		void stop(signal);
	};
	process.once("SIGTERM", () => onSignal("SIGTERM"));
	process.once("SIGINT", () => onSignal("SIGINT"));

	void startLoop();

	return { done, stop };
}

// ───────────────────────────── direct-run entry ──────────────────────────────

/**
 * Run only when invoked directly (`tsx src/dispatch.ts` / the `dispatch` script),
 * never on test import — so importing this module never constructs a RoomServiceClient
 * or spawns a child. An optional HTTP `/health` server starts when `PORT` is set, so a
 * Fly health check can confirm the dispatcher is alive and configured.
 */
if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	import.meta.url === `file://${process.argv[1]}`
) {
	const handle = runDispatcher();
	// Keep the process alive for the lifetime of the dispatcher.
	void handle.done;
	maybeStartHealthServer().catch((err) => {
		console.error(
			`dispatcher: health server failed: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	});
}

/**
 * Start a minimal HTTP `/health` server when `PORT` is set (Fly health check). It
 * reports 200 when the worker env is fully configured, 503 otherwise — WITHOUT ever
 * reading a secret value into the response or a log. No-op when `PORT` is unset (the
 * dispatcher is a worker, not an http service, so the port is optional).
 */
export async function maybeStartHealthServer(): Promise<void> {
	const port = process.env.PORT?.trim();
	if (!port) return;
	const { createServer } = await import("node:http");
	const { isWorkerConfigured } = await import("./config");
	const server = createServer((reqMsg, res) => {
		if (reqMsg.url === "/health" || reqMsg.url === "/") {
			const ok = isWorkerConfigured(process.env);
			res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
			res.end(JSON.stringify({ status: ok ? "ok" : "unconfigured" }));
			return;
		}
		res.writeHead(404);
		res.end();
	});
	server.listen(Number(port), () => {
		console.info(`dispatcher: health server listening on :${port}`);
	});
}
