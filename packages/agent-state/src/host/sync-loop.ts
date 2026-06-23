import type { AgentStateReplica } from "./replica";

/**
 * Periodic + event-triggered sync driver for an agent-state embedded replica.
 *
 * - `intervalMs`: background `sync()` cadence (bounded write traffic).
 * - `kick()`: request an immediate sync after a local write; concurrent kicks
 *   are coalesced into a single in-flight sync so a burst of writes does not
 *   fan out into a burst of network syncs.
 * - `signal`: an AbortSignal cleanly stops the loop, mirroring the abort
 *   discipline host-service uses around its background writers
 *   (`packages/host-service/src/app.ts` bootstrapAbort).
 *
 * In pure-local mode (`replica.isSynced === false`) `replica.sync()` is a no-op,
 * so the loop is harmless and callers never branch on configuration.
 */

export interface SyncLoopOptions {
	intervalMs?: number;
	signal?: AbortSignal;
	/** Injectable scheduler for deterministic tests. Defaults to setTimeout. */
	setTimeoutFn?: (handler: () => void, ms: number) => unknown;
	clearTimeoutFn?: (handle: unknown) => void;
	/** Called when a scheduled/kicked sync throws (e.g. transient offline). */
	onError?: (error: unknown) => void;
}

export interface SyncLoopHandle {
	/** Request an immediate, coalesced sync. */
	kick(): void;
	/** Stop the loop and await any in-flight sync. */
	stop(): Promise<void>;
	/** True until stopped/aborted. */
	readonly running: boolean;
}

export function startSyncLoop(
	replica: AgentStateReplica,
	options: SyncLoopOptions = {},
): SyncLoopHandle {
	const {
		intervalMs,
		signal,
		setTimeoutFn = (handler, ms) => setTimeout(handler, ms),
		clearTimeoutFn = (handle) =>
			clearTimeout(handle as ReturnType<typeof setTimeout>),
		onError,
	} = options;

	let running = true;
	let timer: unknown = null;
	let inFlight: Promise<void> | null = null;
	let kickQueued = false;

	async function runSync(): Promise<void> {
		// Coalesce: if a sync is already running, mark a follow-up and return it.
		if (inFlight) {
			kickQueued = true;
			return inFlight;
		}
		inFlight = (async () => {
			try {
				await replica.sync();
			} catch (error) {
				onError?.(error);
			} finally {
				inFlight = null;
				if (kickQueued && running) {
					kickQueued = false;
					void runSync();
				}
			}
		})();
		return inFlight;
	}

	function scheduleNext(): void {
		if (!running || intervalMs === undefined || intervalMs <= 0) return;
		timer = setTimeoutFn(() => {
			if (!running) return;
			void runSync().finally(scheduleNext);
		}, intervalMs);
	}

	function teardown(): void {
		running = false;
		if (timer !== null) {
			clearTimeoutFn(timer);
			timer = null;
		}
	}

	if (signal) {
		if (signal.aborted) {
			running = false;
		} else {
			signal.addEventListener("abort", teardown, { once: true });
		}
	}

	if (running) scheduleNext();

	return {
		kick() {
			if (!running) return;
			void runSync();
		},
		async stop() {
			teardown();
			if (inFlight) await inFlight;
		},
		get running() {
			return running;
		},
	};
}
