import { describe, expect, it } from "bun:test";
import { OmpEngine } from "./omp-engine";

/**
 * Integration-shaped tests for the omp-driven {@link Engine} edges, exercising
 * the engine against a fake omp process (no real subprocess). They pin the
 * behaviors wired to the verified `omp/15.11.0 --mode rpc` frames:
 *
 *   - sendMessage forwards image files as `prompt.images` ({data, mimeType}),
 *     notes non-image attachments, and drains buffered system reminders into the
 *     `prompt.message` as `<system-reminder>` blocks;
 *   - respondToQuestion answers omp's blocking dialog FLAT ({value}/{confirmed});
 *   - switchThread moves omp's live session to follow the active Rox thread
 *     (switch_session for a known thread, new_session for a new one).
 */

interface ReqCall {
	type: string;
	payload: Record<string, unknown>;
}

/** A fake OmpProcess capturing requests/notifies and answering get_state. */
function createFakeOmp(sessionFile = "/tmp/s/thread-a.jsonl") {
	const reqCalls: ReqCall[] = [];
	const notifyCalls: ReqCall[] = [];
	const uiResponses: Array<Record<string, unknown>> = [];
	const sessionSwitches: string[] = [];
	let newSessions = 0;
	let currentSessionFile = sessionFile;

	const fake = {
		isReady: true,
		async start() {},
		destroy() {},
		subscribe() {
			return () => {};
		},
		async request(type: string, payload: Record<string, unknown> = {}) {
			reqCalls.push({ type, payload });
			if (type === "get_state") {
				return { sessionFile: currentSessionFile, isStreaming: false };
			}
			return {};
		},
		notify(type: string, payload: Record<string, unknown> = {}) {
			notifyCalls.push({ type, payload });
		},
		respondToExtensionUi(id: string, answer: unknown) {
			uiResponses.push(
				answer !== null && typeof answer === "object"
					? { id, ...(answer as Record<string, unknown>) }
					: { id, value: answer },
			);
		},
		async switchSession(path: string) {
			sessionSwitches.push(path);
			currentSessionFile = path;
			return { cancelled: false };
		},
		async newSession() {
			newSessions += 1;
			currentSessionFile = `/tmp/s/new-${newSessions}.jsonl`;
			return { cancelled: false };
		},
		sendHostToolResult() {},
		setSessionFile(path: string) {
			currentSessionFile = path;
		},
	};

	return {
		fake,
		reqCalls,
		notifyCalls,
		uiResponses,
		sessionSwitches,
		get newSessions() {
			return newSessions;
		},
	};
}

/** A minimal mastra-harness spy sufficient for the engine edges under test. */
function createHarnessSpy(threadId: string | null = "thread-a") {
	let currentThread = threadId;
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const rec =
		(method: string, ret: unknown) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
			return ret;
		};
	return {
		harness: {
			init: rec("init", Promise.resolve()),
			selectOrCreateThread: rec("selectOrCreateThread", Promise.resolve("t")),
			setResourceId: rec("setResourceId", undefined),
			getCurrentThreadId: () => currentThread,
			switchThread: (args: { threadId: string }) => {
				calls.push({ method: "switchThread", args: [args] });
				currentThread = args.threadId;
				return Promise.resolve();
			},
			switchModel: rec("switchModel", Promise.resolve()),
			getFullModelId: rec("getFullModelId", "anthropic/claude-haiku-4-5"),
			getState: rec("getState", { thinkingLevel: "medium" }),
			setState: rec("setState", Promise.resolve()),
			getCurrentMode: rec("getCurrentMode", { agent: {} }),
			saveSystemReminderMessage: rec("saveSystemReminderMessage", null),
			subscribe: rec("subscribe", () => {}),
			destroy: rec("destroy", Promise.resolve()),
		},
		calls,
	};
}

const authStorageStub = {
	reload() {},
	async getApiKey() {
		return null;
	},
	// biome-ignore lint/suspicious/noExplicitAny: stub for the EngineBundle authStorage
} as any;

/** Build an OmpEngine with a fake omp process already installed and ready. */
function buildEngine(threadId: string | null = "thread-a") {
	const { harness, calls } = createHarnessSpy(threadId);
	// biome-ignore lint/suspicious/noExplicitAny: harness spy stands in for MastraHarness
	const engine = new OmpEngine(harness as any, authStorageStub, {
		cwd: "/tmp",
	});
	const omp = createFakeOmp();
	// biome-ignore lint/suspicious/noExplicitAny: install the fake omp process
	(engine as any).ompProcess = omp.fake;
	return { engine, omp, harness, calls };
}

describe("OmpEngine.sendMessage attachments + reminders", () => {
	it("forwards image files as prompt.images {data, mimeType}", async () => {
		const { engine, omp } = buildEngine();
		await engine.sendMessage({
			content: "describe this",
			files: [{ data: "PNGB64", mediaType: "image/png", filename: "x.png" }],
		});
		const prompt = omp.reqCalls.find((c) => c.type === "prompt");
		expect(prompt?.payload.message).toBe("describe this");
		expect(prompt?.payload.images).toEqual([
			{ data: "PNGB64", mimeType: "image/png" },
		]);
	});

	it("notes non-image attachments instead of dropping them silently", async () => {
		const { engine, omp } = buildEngine();
		await engine.sendMessage({
			content: "read this",
			files: [{ data: "PDF", mediaType: "application/pdf", filename: "r.pdf" }],
		});
		const prompt = omp.reqCalls.find((c) => c.type === "prompt");
		expect(prompt?.payload.images).toBeUndefined();
		expect(String(prompt?.payload.message)).toContain("r.pdf");
		expect(String(prompt?.payload.message)).toContain("non-image attachment");
	});

	it("drains buffered system reminders into the next prompt as blocks", async () => {
		const { engine, omp } = buildEngine();
		await engine.saveSystemReminderMessage({
			message: "user prefers RU",
			reminderType: "memory",
		});
		await engine.sendMessage({ content: "go" });
		const prompt = omp.reqCalls.find((c) => c.type === "prompt");
		expect(String(prompt?.payload.message)).toBe(
			"<system-reminder>\nuser prefers RU\n</system-reminder>\n\ngo",
		);
		// Reminder is consumed — the following prompt has no block.
		omp.reqCalls.length = 0;
		await engine.sendMessage({ content: "again" });
		const next = omp.reqCalls.find((c) => c.type === "prompt");
		expect(String(next?.payload.message)).toBe("again");
	});
});

describe("OmpEngine.respondToQuestion (flat answer)", () => {
	it("answers an input question with {value} at the top level", () => {
		const { engine, omp } = buildEngine();
		// Drive an input request through the omp event path.
		// biome-ignore lint/suspicious/noExplicitAny: invoke the private event handler
		(engine as any).onOmpEvent({
			type: "extension_ui_request",
			id: "q1",
			method: "input",
			title: "Your name?",
		});
		engine.respondToQuestion({ questionId: "q1", answer: "Ada" });
		expect(omp.uiResponses).toEqual([{ id: "q1", value: "Ada" }]);
	});

	it("answers a confirm question with {confirmed} at the top level", () => {
		const { engine, omp } = buildEngine();
		// biome-ignore lint/suspicious/noExplicitAny: invoke the private event handler
		(engine as any).onOmpEvent({
			type: "extension_ui_request",
			id: "q2",
			method: "confirm",
			title: "Proceed?",
		});
		engine.respondToQuestion({ questionId: "q2", answer: "yes" });
		expect(omp.uiResponses).toEqual([{ id: "q2", confirmed: true }]);
	});
});

describe("OmpEngine.switchThread session continuity", () => {
	it("starts a fresh omp session for a thread omp has not seen", async () => {
		const { engine, omp } = buildEngine("thread-a");
		await engine.switchThread({ threadId: "thread-b" });
		expect(omp.newSessions).toBe(1);
		expect(omp.sessionSwitches).toEqual([]);
	});

	it("switches back to a known thread's recorded omp session file", async () => {
		const { engine, omp } = buildEngine("thread-a");
		// Bind thread-a → its session file by sending a turn.
		omp.fake.setSessionFile("/tmp/s/thread-a.jsonl");
		await engine.sendMessage({ content: "hello from a" });
		// Move to a new thread (fresh session), then back to thread-a.
		await engine.switchThread({ threadId: "thread-b" });
		omp.sessionSwitches.length = 0;
		await engine.switchThread({ threadId: "thread-a" });
		expect(omp.sessionSwitches).toEqual(["/tmp/s/thread-a.jsonl"]);
	});
});
