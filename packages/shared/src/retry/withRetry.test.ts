import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { RetryError } from "@zap-studio/retry/errors";
import { isRetryableError, withRetry } from "./withRetry";

/** Instant sleep so retries don't burn real wall-clock time in tests. */
const noSleep = async (): Promise<void> => {};

/** Builds an error carrying an HTTP-style status code. */
function httpError(status: number): Error & { status: number } {
	return Object.assign(new Error(`HTTP ${status}`), { status });
}

const FLAG = "ZAP_STUDIO_RETRY_ENABLED";

describe("withRetry", () => {
	let previousFlag: string | undefined;

	beforeEach(() => {
		previousFlag = process.env[FLAG];
	});

	afterEach(() => {
		if (previousFlag === undefined) delete process.env[FLAG];
		else process.env[FLAG] = previousFlag;
	});

	describe("flag enabled", () => {
		beforeEach(() => {
			process.env[FLAG] = "true";
		});

		it("returns the value on first-try success without retrying", async () => {
			let calls = 0;
			const result = await withRetry(async () => {
				calls += 1;
				return "ok";
			});
			expect(result).toBe("ok");
			expect(calls).toBe(1);
		});

		it("retries a 429 then succeeds", async () => {
			let calls = 0;
			const result = await withRetry(
				async () => {
					calls += 1;
					if (calls === 1) throw httpError(429);
					return "recovered";
				},
				{ sleep: noSleep },
			);
			expect(result).toBe("recovered");
			expect(calls).toBe(2);
		});

		it("retries network/timeout failures (errors without a status)", async () => {
			let calls = 0;
			const result = await withRetry(
				async () => {
					calls += 1;
					if (calls < 3) throw new Error("ETIMEDOUT");
					return "done";
				},
				{ sleep: noSleep },
			);
			expect(result).toBe("done");
			expect(calls).toBe(3);
		});

		it("exhausts attempts then throws a RetryError carrying the last failure", async () => {
			let calls = 0;
			const attempt = withRetry(
				async () => {
					calls += 1;
					throw new Error("ETIMEDOUT");
				},
				{ maxAttempts: 3, sleep: noSleep },
			);
			await expect(attempt).rejects.toBeInstanceOf(RetryError);
			expect(calls).toBe(3);
		});

		it("does not retry non-429 4xx errors", async () => {
			let calls = 0;
			const attempt = withRetry(
				async () => {
					calls += 1;
					throw httpError(400);
				},
				{ sleep: noSleep },
			);
			await expect(attempt).rejects.toBeInstanceOf(RetryError);
			expect(calls).toBe(1);
		});

		it("honors a custom isRetryable predicate", async () => {
			let calls = 0;
			const attempt = withRetry(
				async () => {
					calls += 1;
					throw httpError(503);
				},
				{ isRetryable: () => false, sleep: noSleep },
			);
			await expect(attempt).rejects.toBeInstanceOf(RetryError);
			expect(calls).toBe(1);
		});
	});

	describe("flag disabled", () => {
		beforeEach(() => {
			delete process.env[FLAG];
		});

		it("calls fn exactly once and never retries (true passthrough)", async () => {
			let calls = 0;
			const attempt = withRetry(
				async () => {
					calls += 1;
					throw httpError(429);
				},
				{ sleep: noSleep },
			);
			// Original error propagates unchanged (not wrapped in RetryError).
			await expect(attempt).rejects.toThrow("HTTP 429");
			expect(calls).toBe(1);
		});
	});
});

describe("isRetryableError", () => {
	it("retries on 429, 5xx, and status-less (network) errors", () => {
		expect(isRetryableError(httpError(429))).toBe(true);
		expect(isRetryableError(httpError(500))).toBe(true);
		expect(isRetryableError(httpError(503))).toBe(true);
		expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
	});

	it("does not retry other 4xx client errors", () => {
		expect(isRetryableError(httpError(400))).toBe(false);
		expect(isRetryableError(httpError(404))).toBe(false);
		expect(isRetryableError(httpError(422))).toBe(false);
	});

	it("reads nested response.status shapes", () => {
		expect(isRetryableError({ response: { status: 429 } })).toBe(true);
		expect(isRetryableError({ response: { status: 404 } })).toBe(false);
	});
});
