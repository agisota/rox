import { describe, expect, it, mock } from "bun:test";
import { MastraEngine } from "./mastra-engine";

/**
 * These tests pin the pass-through contract: every {@link MastraEngine} method
 * forwards verbatim to the wrapped harness, with the same args and return value,
 * and {@link MastraEngine.getMemoryStore} encapsulates the
 * `config.storage.getStore("memory")` reach-in. They are the guard against any
 * future drift from "thin 1:1 forwarder".
 */

interface HarnessCall {
	method: string;
	args: unknown[];
}

function createHarnessSpy(overrides?: Record<string, unknown>) {
	const calls: HarnessCall[] = [];
	const record =
		(method: string, ret: unknown) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
			return ret;
		};

	const harness = {
		init: record("init", Promise.resolve()),
		selectOrCreateThread: record("selectOrCreateThread", Promise.resolve("t")),
		setResourceId: record("setResourceId", undefined),
		getCurrentThreadId: record("getCurrentThreadId", "thread-1"),
		switchThread: record("switchThread", Promise.resolve()),
		switchModel: record("switchModel", Promise.resolve()),
		getFullModelId: record("getFullModelId", "anthropic/claude-sonnet-4"),
		getState: record("getState", { thinkingLevel: "medium" }),
		setState: record("setState", Promise.resolve()),
		getCurrentMode: record("getCurrentMode", { agent: {} }),
		sendMessage: record("sendMessage", Promise.resolve()),
		listMessages: record("listMessages", Promise.resolve([])),
		saveSystemReminderMessage: record("saveSystemReminderMessage", null),
		getDisplayState: record("getDisplayState", { isRunning: false }),
		abort: record("abort", undefined),
		respondToToolApproval: record("respondToToolApproval", undefined),
		respondToQuestion: record("respondToQuestion", undefined),
		respondToPlanApproval: record("respondToPlanApproval", Promise.resolve()),
		subscribe: record("subscribe", () => {}),
		...overrides,
	};

	// biome-ignore lint/suspicious/noExplicitAny: test double for the mastracode Harness
	return { engine: new MastraEngine(harness as any), harness, calls };
}

describe("MastraEngine pass-through", () => {
	it("forwards each method to the wrapped harness with the same args", () => {
		const { engine, calls } = createHarnessSpy();

		engine.init();
		engine.selectOrCreateThread();
		engine.setResourceId({ resourceId: "s1" });
		engine.getCurrentThreadId();
		engine.switchThread({ threadId: "t2" });
		engine.switchModel({ modelId: "m", scope: "thread" });
		engine.getFullModelId();
		engine.getState();
		engine.setState({ thinkingLevel: "high" });
		engine.getCurrentMode();
		engine.sendMessage({ content: "hi" });
		engine.listMessages({ limit: 1 });
		engine.saveSystemReminderMessage({ message: "x", reminderType: "y" });
		engine.getDisplayState();
		engine.abort();
		engine.respondToToolApproval({ decision: "approve" });
		engine.respondToQuestion({ questionId: "q", answer: "a" });
		engine.respondToPlanApproval({
			planId: "p",
			response: { action: "approved" },
		});
		engine.subscribe(() => {});

		expect(calls.map((c) => c.method)).toEqual([
			"init",
			"selectOrCreateThread",
			"setResourceId",
			"getCurrentThreadId",
			"switchThread",
			"switchModel",
			"getFullModelId",
			"getState",
			"setState",
			"getCurrentMode",
			"sendMessage",
			"listMessages",
			"saveSystemReminderMessage",
			"getDisplayState",
			"abort",
			"respondToToolApproval",
			"respondToQuestion",
			"respondToPlanApproval",
			"subscribe",
		]);
		expect(calls.find((c) => c.method === "switchModel")?.args).toEqual([
			{ modelId: "m", scope: "thread" },
		]);
		expect(
			calls.find((c) => c.method === "respondToPlanApproval")?.args,
		).toEqual([{ planId: "p", response: { action: "approved" } }]);
	});

	it("returns the harness's value verbatim", () => {
		const { engine } = createHarnessSpy();
		expect(engine.getCurrentThreadId()).toBe("thread-1");
		expect(engine.getFullModelId()).toBe("anthropic/claude-sonnet-4");
	});

	it("getMemoryStore resolves the harness config.storage memory store", async () => {
		const memoryStore = { tag: "memory-store" };
		const getStore = mock(async () => memoryStore);
		const { engine } = createHarnessSpy({ config: { storage: { getStore } } });

		await expect(engine.getMemoryStore()).resolves.toBe(memoryStore);
		expect(getStore).toHaveBeenCalledWith("memory");
	});

	it("getMemoryStore throws when storage is not configured", async () => {
		const { engine } = createHarnessSpy({ config: {} });
		await expect(engine.getMemoryStore()).rejects.toThrow(
			"Mastra storage is not configured for this session",
		);
	});

	it("getMemoryStore throws when the memory store is unavailable", async () => {
		const { engine } = createHarnessSpy({
			config: { storage: { getStore: async () => null } },
		});
		await expect(engine.getMemoryStore()).rejects.toThrow(
			"Mastra memory storage is unavailable for this session",
		);
	});
});
