import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "thread-1";

const setSessionIdMock = mock((_: string) => {});
const runSessionStartMock = mock(async () => ({
	allowed: true,
	results: [],
	warnings: [],
}));
const harnessSubscribeMock = mock((_: (event: unknown) => void) => () => {});
const harnessInitMock = mock(async () => {});
const harnessSetResourceIdMock = mock((_: { resourceId: string }) => {});
const harnessSelectOrCreateThreadMock = mock(async () => {
	setSessionIdMock(THREAD_ID);
});
const createMastraCodeEnvSnapshots: Array<{
	OPENAI_API_KEY?: string;
	OPENAI_BASE_URL?: string;
}> = [];
const createMastraCodeMock = mock(async () => {
	createMastraCodeEnvSnapshots.push({
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
	});

	return {
		harness: {
			init: harnessInitMock,
			setResourceId: harnessSetResourceIdMock,
			selectOrCreateThread: harnessSelectOrCreateThreadMock,
			subscribe: harnessSubscribeMock,
		},
		mcpManager: null,
		hookManager: {
			setSessionId: setSessionIdMock,
			runSessionStart: runSessionStartMock,
		},
	};
});
const createAuthStorageMock = mock(() => ({
	reload: () => {},
	get: () => undefined,
}));

mock.module("mastracode", () => ({
	createAuthStorage: createAuthStorageMock,
	createMastraCode: createMastraCodeMock,
}));

const { ChatRuntimeService } = await import("./service");
const { setCustomProviderConfig } = await import(
	"../desktop/chat-service/custom-provider-config"
);

let tempDir: string;
let originalRoxHomeDir: string | undefined;
let originalOpenAIKey: string | undefined;
let originalOpenAIBaseUrl: string | undefined;

describe("ChatRuntimeService runtime creation", () => {
	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "rox-chat-service-runtime-"));
		originalRoxHomeDir = process.env.ROX_HOME_DIR;
		originalOpenAIKey = process.env.OPENAI_API_KEY;
		originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
		process.env.ROX_HOME_DIR = tempDir;
		delete process.env.OPENAI_API_KEY;
		delete process.env.OPENAI_BASE_URL;
		setSessionIdMock.mockClear();
		runSessionStartMock.mockClear();
		harnessSubscribeMock.mockClear();
		harnessInitMock.mockClear();
		harnessSetResourceIdMock.mockClear();
		harnessSelectOrCreateThreadMock.mockClear();
		createMastraCodeMock.mockClear();
		createAuthStorageMock.mockClear();
		createMastraCodeEnvSnapshots.length = 0;
	});

	afterEach(() => {
		if (originalRoxHomeDir === undefined) {
			delete process.env.ROX_HOME_DIR;
		} else {
			process.env.ROX_HOME_DIR = originalRoxHomeDir;
		}
		if (originalOpenAIKey === undefined) {
			delete process.env.OPENAI_API_KEY;
		} else {
			process.env.OPENAI_API_KEY = originalOpenAIKey;
		}
		if (originalOpenAIBaseUrl === undefined) {
			delete process.env.OPENAI_BASE_URL;
		} else {
			process.env.OPENAI_BASE_URL = originalOpenAIBaseUrl;
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("reasserts the Rox session id after thread selection", async () => {
		const service = new ChatRuntimeService({
			headers: async () => ({}),
			apiUrl: "http://localhost:3000",
		});

		const runtime = await (
			service as unknown as {
				getOrCreateRuntime: (
					sessionId: string,
					cwd?: string,
				) => Promise<{ sessionId: string }>;
			}
		).getOrCreateRuntime(SESSION_ID, "/tmp/project");

		expect(runtime.sessionId).toBe(SESSION_ID);
		expect(setSessionIdMock.mock.calls.map(([sessionId]) => sessionId)).toEqual(
			[SESSION_ID, THREAD_ID, SESSION_ID],
		);
		expect(runSessionStartMock).toHaveBeenCalledTimes(1);
	});

	it("prepares custom provider env before creating the mastracode runtime", async () => {
		setCustomProviderConfig({
			baseUrl: "https://api.example.com/v1",
			apiKey: "sk-custom",
			modelId: "llama-3.3-70b",
		});

		const service = new ChatRuntimeService({
			headers: async () => ({}),
			apiUrl: "http://localhost:3000",
		});

		await (
			service as unknown as {
				getOrCreateRuntime: (
					sessionId: string,
					cwd?: string,
					selectedModelId?: string,
				) => Promise<{ sessionId: string }>;
			}
		).getOrCreateRuntime(SESSION_ID, "/tmp/project", "llama-3.3-70b");

		expect(createMastraCodeEnvSnapshots).toEqual([
			{
				OPENAI_API_KEY: "sk-custom",
				OPENAI_BASE_URL: "https://api.example.com/v1",
			},
		]);
	});
});
