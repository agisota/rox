import { beforeEach, describe, expect, mock, test } from "bun:test";

let connectionResult: Record<string, unknown> | null = null;

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: mock(async () => connectionResult),
			},
		},
	},
}));

mock.module("@rox/db/schema", () => ({
	integrationConnections: {
		id: "id",
		provider: "provider",
	},
	integrationInboundEvents: {
		id: "id",
		provider: "provider",
		externalEventId: "externalEventId",
	},
}));

const decodeSecretMock = mock((value: string) => `decoded:${value}`);
mock.module("@rox/trpc/integration-secret", () => ({
	decodeSecret: decodeSecretMock,
}));

const runTelegramAgentMock = mock(async () => ({
	text: "I created the task.",
	actions: [{ type: "create_task" }],
}));
const formatActionsForTelegramMock = mock(() => "Changes:\n- create_task");
const formatErrorForTelegramMock = mock(async () => "Sorry, that failed.");
mock.module("./run-agent", () => ({
	runTelegramAgent: runTelegramAgentMock,
	formatActionsForTelegram: formatActionsForTelegramMock,
	formatErrorForTelegram: formatErrorForTelegramMock,
}));

const sendMessageMock = mock(async () => ({ ok: true }));
mock.module("./telegram-client", () => ({
	sendMessage: sendMessageMock,
}));

const { processTelegramMessage } = await import("./process-message");

const ACTIVE_CONNECTION = {
	id: "conn-1",
	organizationId: "org-1",
	connectedByUserId: "user-1",
	accessToken: "stored-token",
	disconnectedAt: null,
};

const PAYLOAD = {
	connectionId: "conn-1",
	update: {
		updateId: 123,
		chatId: 555,
		text: "create a task",
		fromUserId: 999,
		fromIsBot: false,
	},
};

describe("processTelegramMessage", () => {
	beforeEach(() => {
		connectionResult = ACTIVE_CONNECTION;
		decodeSecretMock.mockClear();
		runTelegramAgentMock.mockClear();
		formatActionsForTelegramMock.mockClear();
		formatErrorForTelegramMock.mockClear();
		sendMessageMock.mockClear();
		runTelegramAgentMock.mockImplementation(async () => ({
			text: "I created the task.",
			actions: [{ type: "create_task" }],
		}));
		formatActionsForTelegramMock.mockImplementation(
			() => "Changes:\n- create_task",
		);
	});

	test("runs the Telegram agent and sends reply plus action summary", async () => {
		const result = await processTelegramMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			replied: true,
			messagesSent: 2,
		});
		expect(runTelegramAgentMock).toHaveBeenCalledWith({
			prompt: "create a task",
			organizationId: "org-1",
			userId: "user-1",
		});
		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		expect(sendMessageMock.mock.calls[0]?.[0]).toEqual({
			botToken: "decoded:stored-token",
			chatId: 555,
			text: "I created the task.",
		});
		expect(sendMessageMock.mock.calls[1]?.[0]).toEqual({
			botToken: "decoded:stored-token",
			chatId: 555,
			text: "Changes:\n- create_task",
		});
	});

	test("sends a friendly error when the agent fails", async () => {
		runTelegramAgentMock.mockImplementation(async () => {
			throw new Error("provider failed");
		});

		const result = await processTelegramMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			replied: false,
			messagesSent: 1,
		});
		expect(formatErrorForTelegramMock).toHaveBeenCalled();
		expect(sendMessageMock).toHaveBeenCalledWith({
			botToken: "decoded:stored-token",
			chatId: 555,
			text: "Sorry, that failed.",
		});
	});

	test("skips when the connection is missing", async () => {
		connectionResult = null;

		const result = await processTelegramMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			skipped: true,
			reason: "No active Telegram connection",
		});
		expect(runTelegramAgentMock).not.toHaveBeenCalled();
		expect(sendMessageMock).not.toHaveBeenCalled();
	});

	test("skips when the stored token cannot be decoded", async () => {
		decodeSecretMock.mockImplementation(() => {
			throw new Error("bad secret");
		});

		const result = await processTelegramMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			skipped: true,
			reason: "Could not decode Telegram bot token",
		});
		expect(runTelegramAgentMock).not.toHaveBeenCalled();
		expect(sendMessageMock).not.toHaveBeenCalled();
	});
});
