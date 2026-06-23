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
}));

const decodeSecretMock = mock((value: string) => `decoded:${value}`);
mock.module("@rox/trpc/integration-secret", () => ({
	decodeSecret: decodeSecretMock,
}));

const runLarkAgentMock = mock(async () => ({
	text: "I created the task.",
	actions: [{ type: "create_task" }],
}));
const formatActionsForLarkMock = mock(() => "Changes:\n- create_task");
const formatErrorForLarkMock = mock(async () => "Sorry, that failed.");
mock.module("./run-agent", () => ({
	runLarkAgent: runLarkAgentMock,
	formatActionsForLark: formatActionsForLarkMock,
	formatErrorForLark: formatErrorForLarkMock,
}));

const getTenantAccessTokenMock = mock(async () => "t-token");
const replyMessageMock = mock(async () => ({ code: 0 }));
const sendMessageMock = mock(async () => ({ code: 0 }));
mock.module("./lark-client", () => ({
	getTenantAccessToken: getTenantAccessTokenMock,
	replyMessage: replyMessageMock,
	sendMessage: sendMessageMock,
}));

const { processLarkMessage } = await import("./process-message");

const ACTIVE_CONNECTION = {
	id: "conn-1",
	organizationId: "org-1",
	connectedByUserId: "user-1",
	accessToken: "stored-secret",
	disconnectedAt: null,
	config: { provider: "lark", appId: "cli_app123" },
};

const PAYLOAD = {
	connectionId: "conn-1",
	chatId: "oc_chat",
	messageId: "om_source",
	eventId: "evt-1",
	text: "create a task",
};

describe("processLarkMessage", () => {
	beforeEach(() => {
		connectionResult = ACTIVE_CONNECTION;
		decodeSecretMock.mockClear();
		decodeSecretMock.mockImplementation((value: string) => `decoded:${value}`);
		runLarkAgentMock.mockClear();
		formatActionsForLarkMock.mockClear();
		formatErrorForLarkMock.mockClear();
		getTenantAccessTokenMock.mockClear();
		getTenantAccessTokenMock.mockImplementation(async () => "t-token");
		replyMessageMock.mockClear();
		replyMessageMock.mockImplementation(async () => ({ code: 0 }));
		sendMessageMock.mockClear();
		sendMessageMock.mockImplementation(async () => ({ code: 0 }));
		runLarkAgentMock.mockImplementation(async () => ({
			text: "I created the task.",
			actions: [{ type: "create_task" }],
		}));
		formatActionsForLarkMock.mockImplementation(
			() => "Changes:\n- create_task",
		);
	});

	test("runs the Lark agent and threads the reply plus action summary", async () => {
		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			replied: true,
			messagesSent: 2,
		});
		expect(getTenantAccessTokenMock).toHaveBeenCalledWith({
			appId: "cli_app123",
			appSecret: "decoded:stored-secret",
		});
		expect(runLarkAgentMock).toHaveBeenCalledWith({
			prompt: "create a task",
			organizationId: "org-1",
			userId: "user-1",
		});
		expect(replyMessageMock).toHaveBeenCalledTimes(2);
		expect(replyMessageMock.mock.calls[0]?.[0]).toEqual({
			tenantAccessToken: "t-token",
			messageId: "om_source",
			text: "I created the task.",
			uuid: "evt-1:reply",
		});
		expect(replyMessageMock.mock.calls[1]?.[0]).toEqual({
			tenantAccessToken: "t-token",
			messageId: "om_source",
			text: "Changes:\n- create_task",
			uuid: "evt-1:actions",
		});
		expect(sendMessageMock).not.toHaveBeenCalled();
	});

	test("falls back to a fresh chat message when no message_id is present", async () => {
		const result = await processLarkMessage({ ...PAYLOAD, messageId: null });

		expect(result.replied).toBe(true);
		expect(replyMessageMock).not.toHaveBeenCalled();
		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		expect(sendMessageMock.mock.calls[0]?.[0]).toEqual({
			tenantAccessToken: "t-token",
			chatId: "oc_chat",
			text: "I created the task.",
			uuid: "evt-1:reply",
		});
	});

	test("sends a friendly error when the agent fails", async () => {
		runLarkAgentMock.mockImplementation(async () => {
			throw new Error("provider failed");
		});

		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			replied: false,
			messagesSent: 1,
		});
		expect(formatErrorForLarkMock).toHaveBeenCalled();
		expect(replyMessageMock).toHaveBeenCalledWith({
			tenantAccessToken: "t-token",
			messageId: "om_source",
			text: "Sorry, that failed.",
			uuid: "evt-1:error",
		});
	});

	test("does not retry the job when sending the fallback error reply fails", async () => {
		runLarkAgentMock.mockImplementation(async () => {
			throw new Error("provider failed");
		});
		replyMessageMock.mockImplementation(async () => {
			throw new Error("lark unavailable");
		});

		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			replied: false,
			messagesSent: 0,
			reason: "Agent failed and fallback reply could not be sent",
		});
		expect(formatErrorForLarkMock).toHaveBeenCalled();
	});

	test("skips when the connection is missing", async () => {
		connectionResult = null;

		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			skipped: true,
			reason: "No active Lark connection",
		});
		expect(runLarkAgentMock).not.toHaveBeenCalled();
		expect(replyMessageMock).not.toHaveBeenCalled();
	});

	test("skips when the connection has no appId", async () => {
		connectionResult = {
			...ACTIVE_CONNECTION,
			config: { provider: "lark" },
		};

		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			skipped: true,
			reason: "Lark connection missing appId",
		});
		expect(getTenantAccessTokenMock).not.toHaveBeenCalled();
	});

	test("skips when the stored app secret cannot be decoded", async () => {
		decodeSecretMock.mockImplementation(() => {
			throw new Error("bad secret");
		});

		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			skipped: true,
			reason: "Could not decode Lark app secret",
		});
		expect(getTenantAccessTokenMock).not.toHaveBeenCalled();
		expect(runLarkAgentMock).not.toHaveBeenCalled();
	});

	test("acks without retry when the tenant token cannot be minted", async () => {
		getTenantAccessTokenMock.mockImplementation(async () => {
			throw new Error("invalid app secret");
		});

		const result = await processLarkMessage(PAYLOAD);

		expect(result).toEqual({
			success: true,
			replied: false,
			messagesSent: 0,
			reason: "Could not obtain Lark tenant access token",
		});
		expect(runLarkAgentMock).not.toHaveBeenCalled();
		expect(replyMessageMock).not.toHaveBeenCalled();
	});
});
