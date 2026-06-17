import { beforeEach, describe, expect, mock, test } from "bun:test";

type QueuedAnthropicResult =
	| { throw: unknown }
	| {
			stop_reason: "end_turn" | "tool_use" | "pause_turn";
			content: unknown[];
	  };

let messageQueue: QueuedAnthropicResult[] = [];

const createMessageMock = mock(async () => {
	const next = messageQueue.shift();
	if (!next) {
		return { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] };
	}
	if ("throw" in next) throw next.throw;
	return next;
});

class MockAnthropic {
	messages = {
		create: createMessageMock,
	};
}

mock.module("@anthropic-ai/sdk", () => ({
	default: MockAnthropic,
}));

mock.module("@/env", () => ({
	env: {
		ANTHROPIC_API_KEY: "anthropic-test-key",
	},
}));

mock.module("@/lib/analytics", () => ({
	posthog: { capture: mock(() => undefined) },
}));

const listToolsMock = mock(async () => ({
	tools: [] as Array<{
		name: string;
		description?: string;
		inputSchema: unknown;
	}>,
}));
const callToolMock = mock(async ({ name }: { name: string }) => {
	if (name === "list_members") {
		return {
			structuredContent: {
				members: [{ id: "user-1", name: "User", email: "user@example.com" }],
			},
		};
	}
	if (name === "list_task_statuses") {
		return { structuredContent: { statuses: [] } };
	}
	if (name === "list_devices") {
		return { structuredContent: { devices: [] } };
	}
	return { content: [{ type: "text", text: "done" }] };
});
const cleanupMock = mock(async () => undefined);

mock.module("@rox/mcp/in-memory", () => ({
	createInMemoryMcpClient: mock(async () => ({
		client: {
			listTools: listToolsMock,
			callTool: callToolMock,
		},
		cleanup: cleanupMock,
	})),
}));

const { formatErrorForTelegram, runTelegramAgent } = await import(
	"./run-agent"
);

function textResponse(text: string): QueuedAnthropicResult {
	return {
		stop_reason: "end_turn",
		content: [{ type: "text", text }],
	};
}

function toolUseResponse(index: number): QueuedAnthropicResult {
	return {
		stop_reason: "tool_use",
		content: [
			{
				type: "tool_use",
				id: `tool-${index}`,
				name: "rox_create_task",
				input: { title: `Task ${index}` },
			},
		],
	};
}

describe("runTelegramAgent", () => {
	beforeEach(() => {
		messageQueue = [];
		createMessageMock.mockClear();
		listToolsMock.mockClear();
		callToolMock.mockClear();
		cleanupMock.mockClear();
		listToolsMock.mockImplementation(async () => ({ tools: [] }));
	});

	test("retries retryable Anthropic failures before returning a response", async () => {
		const error = Object.assign(new Error("provider overloaded"), {
			status: 529,
		});
		messageQueue = [{ throw: error }, textResponse("Recovered")];

		const result = await runTelegramAgent({
			prompt: "hello",
			organizationId: "org-1",
			userId: "user-1",
		});

		expect(result.text).toBe("Recovered");
		expect(createMessageMock).toHaveBeenCalledTimes(2);
		expect(cleanupMock).toHaveBeenCalled();
	});

	test("formats temporary provider errors without a secondary model call", async () => {
		const text = await formatErrorForTelegram(new Error("rate limit exceeded"));

		expect(text).toContain("temporarily unavailable");
		expect(createMessageMock).not.toHaveBeenCalled();
	});

	test("returns an explicit message when the tool loop reaches its limit", async () => {
		listToolsMock.mockImplementation(async () => ({
			tools: [
				{
					name: "create_task",
					description: "Create a task",
					inputSchema: { type: "object" },
				},
			],
		}));
		messageQueue = Array.from({ length: 11 }, (_, index) =>
			toolUseResponse(index),
		);

		const result = await runTelegramAgent({
			prompt: "create many tasks",
			organizationId: "org-1",
			userId: "user-1",
		});

		expect(result.text).toContain("tool limit");
		expect(result.actions).toHaveLength(10);
		expect(createMessageMock).toHaveBeenCalledTimes(11);
	});
});
