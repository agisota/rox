import { describe, expect, it } from "bun:test";
import { scheduleSandboxExpiry } from "./scheduleSandboxExpiry";

interface FakeTimers {
	now: () => number;
	setTimer: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
	/** Advance the clock and fire the most recently scheduled live timer. */
	flush: () => void;
	pending: () => number;
	lastDelay: () => number | null;
}

function createFakeTimers(startMs = 0): FakeTimers {
	const timers = new Map<number, { cb: () => void; ms: number }>();
	let clock = startMs;
	let nextId = 1;
	let lastDelay: number | null = null;
	return {
		now: () => clock,
		setTimer: (callback, ms) => {
			const id = nextId++;
			lastDelay = ms;
			timers.set(id, { cb: callback, ms });
			return id as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimer: (handle) => {
			timers.delete(handle as unknown as number);
		},
		flush: () => {
			const last = [...timers.entries()].at(-1);
			if (!last) return;
			timers.delete(last[0]);
			clock += last[1].ms;
			last[1].cb();
		},
		pending: () => timers.size,
		lastDelay: () => lastDelay,
	};
}

describe("scheduleSandboxExpiry", () => {
	it("fires onExpire synchronously when already expired", () => {
		let expired = 0;
		const timers = createFakeTimers(5_000);
		scheduleSandboxExpiry({
			expiresAt: new Date(1_000),
			now: timers.now,
			onExpire: () => {
				expired++;
			},
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		});
		expect(expired).toBe(1);
		expect(timers.pending()).toBe(0);
	});

	it("arms a timer for the remaining lifetime and fires once", () => {
		let expired = 0;
		const timers = createFakeTimers(0);
		scheduleSandboxExpiry({
			expiresAt: new Date(60_000),
			now: timers.now,
			onExpire: () => {
				expired++;
			},
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		});
		expect(expired).toBe(0);
		expect(timers.lastDelay()).toBe(60_000);
		timers.flush();
		expect(expired).toBe(1);
		expect(timers.pending()).toBe(0);
	});

	it("caps and re-arms delays beyond setTimeout's safe range", () => {
		let expired = 0;
		const timers = createFakeTimers(0);
		// ~40 days out — exceeds the ~24.8 day setTimeout ceiling.
		const expiresAt = new Date(40 * 24 * 60 * 60 * 1_000);
		scheduleSandboxExpiry({
			expiresAt,
			now: timers.now,
			onExpire: () => {
				expired++;
			},
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		});
		expect(expired).toBe(0);
		expect(timers.lastDelay()).toBe(2_147_483_647);
		// First flush advances the clock by the cap but the deadline is still in
		// the future, so it must re-arm rather than fire.
		timers.flush();
		expect(expired).toBe(0);
		expect(timers.pending()).toBe(1);
		// Drain the remaining chunks until it finally fires.
		timers.flush();
		timers.flush();
		expect(expired).toBe(1);
	});

	it("cancel() clears the pending timer and prevents expiry", () => {
		let expired = 0;
		const timers = createFakeTimers(0);
		const handle = scheduleSandboxExpiry({
			expiresAt: new Date(60_000),
			now: timers.now,
			onExpire: () => {
				expired++;
			},
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		});
		expect(timers.pending()).toBe(1);
		handle.cancel();
		expect(timers.pending()).toBe(0);
		timers.flush();
		expect(expired).toBe(0);
	});
});
