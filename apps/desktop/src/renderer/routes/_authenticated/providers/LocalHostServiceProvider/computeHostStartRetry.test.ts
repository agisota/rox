import { describe, expect, it } from "bun:test";
import {
	computeHostStartRetry,
	HOST_START_RETRY_BASE_DELAY_MS,
	type HostStartRetryState,
	MAX_HOST_START_ATTEMPTS,
} from "./computeHostStartRetry";

const fresh: HostStartRetryState = { attempts: 0, lastAttemptAt: null };

describe("computeHostStartRetry", () => {
	it("starts immediately on first attempt when stopped and able to start", () => {
		const decision = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "stopped",
			state: fresh,
			now: 1_000,
		});

		expect(decision.shouldStart).toBe(true);
		expect(decision.nextState).toEqual({ attempts: 1, lastAttemptAt: 1_000 });
	});

	it("retries from 'unknown' as well as 'stopped'", () => {
		const decision = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "unknown",
			state: fresh,
			now: 1_000,
		});

		expect(decision.shouldStart).toBe(true);
	});

	it("does not start while a token/org is unavailable and keeps the budget", () => {
		const decision = computeHostStartRetry({
			canStart: false,
			hostReady: false,
			status: "stopped",
			state: { attempts: 2, lastAttemptAt: 500 },
			now: 10_000,
		});

		expect(decision.shouldStart).toBe(false);
		expect(decision.nextState).toEqual({ attempts: 2, lastAttemptAt: 500 });
	});

	it("waits for the backoff window before retrying", () => {
		const state: HostStartRetryState = { attempts: 1, lastAttemptAt: 1_000 };
		// base * 2^1 = 4000ms window; 3000ms later is too soon.
		const tooSoon = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "stopped",
			state,
			now: 1_000 + 3_000,
		});
		expect(tooSoon.shouldStart).toBe(false);
		expect(tooSoon.nextState).toEqual(state);

		const afterWindow = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "stopped",
			state,
			now: 1_000 + HOST_START_RETRY_BASE_DELAY_MS * 2 + 1,
		});
		expect(afterWindow.shouldStart).toBe(true);
		expect(afterWindow.nextState.attempts).toBe(2);
	});

	it("stops retrying after the maximum number of attempts", () => {
		const decision = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "stopped",
			state: { attempts: MAX_HOST_START_ATTEMPTS, lastAttemptAt: 0 },
			now: 10_000_000,
		});

		expect(decision.shouldStart).toBe(false);
	});

	it("does not start while the host is already starting", () => {
		const decision = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "starting",
			state: fresh,
			now: 1_000,
		});

		expect(decision.shouldStart).toBe(false);
		expect(decision.nextState).toEqual(fresh);
	});

	it("resets the budget once the host is ready", () => {
		const decision = computeHostStartRetry({
			canStart: true,
			hostReady: true,
			status: "running",
			state: { attempts: 4, lastAttemptAt: 9_000 },
			now: 12_000,
		});

		expect(decision.shouldStart).toBe(false);
		expect(decision.nextState).toEqual({ attempts: 0, lastAttemptAt: null });
	});

	it("resets the budget when status reports running even without a url yet", () => {
		const decision = computeHostStartRetry({
			canStart: true,
			hostReady: false,
			status: "running",
			state: { attempts: 3, lastAttemptAt: 9_000 },
			now: 12_000,
		});

		expect(decision.shouldStart).toBe(false);
		expect(decision.nextState).toEqual({ attempts: 0, lastAttemptAt: null });
	});
});
