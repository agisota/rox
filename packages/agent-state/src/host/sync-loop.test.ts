import { describe, expect, it } from "bun:test";
import type { AgentStateReplica } from "./replica";
import { startSyncLoop } from "./sync-loop";

/** A manual scheduler so tests drive time deterministically. */
function manualScheduler() {
	const tasks = new Map<number, () => void>();
	let nextId = 1;
	return {
		setTimeoutFn(handler: () => void, _ms: number): unknown {
			const id = nextId++;
			tasks.set(id, handler);
			return id;
		},
		clearTimeoutFn(handle: unknown): void {
			tasks.delete(handle as number);
		},
		/** Fire the earliest pending timer. */
		tick(): void {
			const [id, handler] = [...tasks.entries()][0] ?? [];
			if (id !== undefined && handler) {
				tasks.delete(id);
				handler();
			}
		},
		get pending(): number {
			return tasks.size;
		},
	};
}

function fakeReplica(): {
	replica: AgentStateReplica;
	syncCount: () => number;
	resolveNext: () => void;
} {
	let syncCount = 0;
	const gates: Array<() => void> = [];
	const replica: AgentStateReplica = {
		client: {} as AgentStateReplica["client"],
		isSynced: true,
		async sync() {
			syncCount += 1;
			await new Promise<void>((resolve) => {
				gates.push(resolve);
			});
		},
		close() {},
	};
	return {
		replica,
		syncCount: () => syncCount,
		resolveNext: () => {
			const gate = gates.shift();
			gate?.();
		},
	};
}

describe("startSyncLoop", () => {
	it("syncs on the configured interval cadence", async () => {
		const sched = manualScheduler();
		let count = 0;
		const replica: AgentStateReplica = {
			client: {} as AgentStateReplica["client"],
			isSynced: true,
			async sync() {
				count += 1;
			},
			close() {},
		};
		const loop = startSyncLoop(replica, {
			intervalMs: 1000,
			setTimeoutFn: sched.setTimeoutFn,
			clearTimeoutFn: sched.clearTimeoutFn,
		});

		expect(sched.pending).toBe(1);
		sched.tick();
		// Let the async sync settle and the .finally(scheduleNext) chain run.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(count).toBe(1);
		// It reschedules itself.
		expect(sched.pending).toBe(1);

		await loop.stop();
		expect(loop.running).toBe(false);
	});

	it("coalesces concurrent kicks into a single in-flight sync", async () => {
		const { replica, syncCount, resolveNext } = fakeReplica();
		const loop = startSyncLoop(replica, {});

		loop.kick();
		loop.kick();
		loop.kick();
		// Only one sync should be in flight despite three kicks.
		expect(syncCount()).toBe(1);

		// Completing the in-flight sync triggers exactly one coalesced follow-up.
		resolveNext();
		await Promise.resolve();
		await Promise.resolve();
		expect(syncCount()).toBe(2);

		resolveNext();
		await loop.stop();
	});

	it("stops syncing once aborted", async () => {
		const sched = manualScheduler();
		let count = 0;
		const replica: AgentStateReplica = {
			client: {} as AgentStateReplica["client"],
			isSynced: true,
			async sync() {
				count += 1;
			},
			close() {},
		};
		const controller = new AbortController();
		const loop = startSyncLoop(replica, {
			intervalMs: 1000,
			signal: controller.signal,
			setTimeoutFn: sched.setTimeoutFn,
			clearTimeoutFn: sched.clearTimeoutFn,
		});

		expect(sched.pending).toBe(1);
		controller.abort();
		expect(loop.running).toBe(false);
		expect(sched.pending).toBe(0);

		// kicks after abort are ignored.
		loop.kick();
		expect(count).toBe(0);
	});

	it("does not start when the signal is already aborted", () => {
		const replica: AgentStateReplica = {
			client: {} as AgentStateReplica["client"],
			isSynced: true,
			async sync() {},
			close() {},
		};
		const loop = startSyncLoop(replica, {
			intervalMs: 1000,
			signal: AbortSignal.abort(),
		});
		expect(loop.running).toBe(false);
	});

	it("surfaces sync errors through onError without crashing the loop", async () => {
		const errors: unknown[] = [];
		const replica: AgentStateReplica = {
			client: {} as AgentStateReplica["client"],
			isSynced: true,
			async sync() {
				throw new Error("offline");
			},
			close() {},
		};
		const loop = startSyncLoop(replica, {
			onError: (e) => errors.push(e),
		});
		loop.kick();
		await Promise.resolve();
		await Promise.resolve();
		expect(errors).toHaveLength(1);
		await loop.stop();
	});
});
