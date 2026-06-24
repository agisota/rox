import { describe, expect, test } from "bun:test";
import type { HostDb } from "../../db";
import type { ModelProviderRuntimeResolver } from "../../providers/model-providers";
import { ChatRuntimeManager } from "./chat";

/**
 * Cold-boot getSnapshot state machine.
 *
 * These exercise the lazy non-blocking boot path WITHOUT booting a real mastra
 * runtime: a resolver that reports no usable runtime env makes createRuntime
 * throw "No model provider credentials available" deterministically (the check
 * runs before any createMastraCode / DB work), which is exactly the
 * deterministic-failure case the backoff + sticky-error design targets.
 */
function failingResolver(): {
	resolver: ModelProviderRuntimeResolver;
	bootAttempts: () => number;
} {
	let attempts = 0;
	return {
		resolver: {
			hasUsableRuntimeEnv: async () => {
				attempts += 1;
				return false;
			},
			prepareRuntimeEnv: async () => {},
		},
		bootAttempts: () => attempts,
	};
}

// Drain microtasks so a backgrounded boot promise settles before the next poll.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function manager(resolver: ModelProviderRuntimeResolver): ChatRuntimeManager {
	// db is unused on the failure path (the env check throws first).
	return new ChatRuntimeManager({
		db: {} as HostDb,
		runtimeResolver: resolver,
	});
}

describe("ChatRuntimeManager cold-boot getSnapshot", () => {
	const input = { sessionId: "s1", workspaceId: "w1" };

	test("cold session returns a booting discriminator without blocking", async () => {
		const { resolver } = failingResolver();
		const snap = await manager(resolver).getSnapshot(input);
		expect(snap.displayState).toBeNull();
		expect(snap.messages).toEqual([]);
		expect(snap.boot).toEqual({ status: "booting" });
	});

	test("a failed boot surfaces a STABLE error and backs off (no per-poll re-kick)", async () => {
		const { resolver, bootAttempts } = failingResolver();
		const mgr = manager(resolver);

		await mgr.getSnapshot(input); // kicks the boot
		await flush(); // boot rejects

		const failed = await mgr.getSnapshot(input);
		expect(failed.boot?.status).toBe("failed");
		expect(failed.boot?.error).toContain("No model provider credentials");

		const attemptsAfterFailure = bootAttempts();
		// Immediate polls within the backoff window must NOT spawn fresh boots.
		await mgr.getSnapshot(input);
		await mgr.getSnapshot(input);
		await mgr.getSnapshot(input);
		expect(bootAttempts()).toBe(attemptsAfterFailure);
	});

	test("getSnapshot never throws on a deterministic cold-boot failure", async () => {
		const { resolver } = failingResolver();
		const mgr = manager(resolver);
		await mgr.getSnapshot(input);
		await flush();
		// Pre-fix this threw the cached boot error; the fix returns a failed
		// discriminator instead so React Query's auto-retry can't swallow it.
		await expect(mgr.getSnapshot(input)).resolves.toBeDefined();
	});

	test("disposeRuntime clears cold-boot state so a later poll retries (no phantom error)", async () => {
		const { resolver, bootAttempts } = failingResolver();
		const mgr = manager(resolver);

		await mgr.getSnapshot(input);
		await flush();
		expect((await mgr.getSnapshot(input)).boot?.status).toBe("failed");

		await mgr.disposeRuntime(input.sessionId, input.workspaceId);

		const attemptsBeforeRetry = bootAttempts();
		// After dispose the stale "failed" entry is gone → the next poll boots
		// fresh (booting) instead of replaying a phantom failure for a gone session.
		const afterDispose = await mgr.getSnapshot(input);
		expect(afterDispose.boot?.status).toBe("booting");
		await flush();
		expect(bootAttempts()).toBeGreaterThan(attemptsBeforeRetry);
	});
});
