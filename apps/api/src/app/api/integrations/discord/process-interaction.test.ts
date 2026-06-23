import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mutable holders the module mocks read at call time.
let connectionRow:
	| {
			id: string;
			provider: "discord";
			organizationId: string;
			connectedByUserId: string;
			disconnectedAt: Date | null;
	  }
	| undefined;

const findFirstMock = mock(async () => connectionRow);

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: findFirstMock,
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

const runDiscordAgentMock = mock(
	async (_params: unknown): Promise<{ text: string; actions: unknown[] }> => ({
		text: "agent answer",
		actions: [],
	}),
);

mock.module("./run-agent", () => ({
	runDiscordAgent: runDiscordAgentMock,
	formatActionsForDiscord: (actions: { type: string }[]) =>
		actions.length
			? `Changes:\n${actions.map((a) => `- ${a.type}`).join("\n")}`
			: "",
	formatErrorForDiscord: async () => "Sorry, I couldn't complete that.",
}));

const editOriginalMock = mock(async () => undefined);

mock.module("./discord-client", () => ({
	editOriginalInteractionResponse: editOriginalMock,
}));

const { processDiscordInteraction } = await import("./process-interaction");

const baseConnection = {
	id: "conn-1",
	provider: "discord" as const,
	organizationId: "org-1",
	connectedByUserId: "user-1",
	disconnectedAt: null,
};

const basePayload = {
	connectionId: "conn-1",
	interaction: {
		id: "interaction-1",
		token: "tok-1",
		applicationId: "app-1",
		text: "what is rox?",
	},
};

describe("processDiscordInteraction", () => {
	beforeEach(() => {
		connectionRow = { ...baseConnection };
		findFirstMock.mockClear();
		runDiscordAgentMock.mockClear();
		runDiscordAgentMock.mockImplementation(async () => ({
			text: "agent answer",
			actions: [],
		}));
		editOriginalMock.mockClear();
		editOriginalMock.mockImplementation(async () => undefined);
	});

	test("runs the agent and edits the deferred response with the answer", async () => {
		const result = await processDiscordInteraction(basePayload);

		expect(runDiscordAgentMock).toHaveBeenCalledTimes(1);
		const agentArgs = runDiscordAgentMock.mock.calls[0]?.[0] as {
			prompt: string;
			organizationId: string;
			userId: string;
		};
		expect(agentArgs.prompt).toBe("what is rox?");
		expect(agentArgs.organizationId).toBe("org-1");
		expect(agentArgs.userId).toBe("user-1");

		expect(editOriginalMock).toHaveBeenCalledTimes(1);
		const editArgs = editOriginalMock.mock.calls[0]?.[0] as {
			applicationId: string;
			interactionToken: string;
			content: string;
		};
		expect(editArgs.applicationId).toBe("app-1");
		expect(editArgs.interactionToken).toBe("tok-1");
		expect(editArgs.content).toBe("agent answer");

		expect(result).toEqual({ success: true, replied: true });
	});

	test("appends formatted actions to the edited reply", async () => {
		runDiscordAgentMock.mockImplementation(async () => ({
			text: "Created it",
			actions: [{ type: "create_task" }],
		}));

		await processDiscordInteraction(basePayload);

		const editArgs = editOriginalMock.mock.calls[0]?.[0] as { content: string };
		expect(editArgs.content).toContain("Created it");
		expect(editArgs.content).toContain("create_task");
	});

	test("skips when no active connection is found", async () => {
		connectionRow = undefined;

		const result = await processDiscordInteraction(basePayload);

		expect(result.skipped).toBe(true);
		expect(runDiscordAgentMock).not.toHaveBeenCalled();
		expect(editOriginalMock).not.toHaveBeenCalled();
	});

	test("skips a disconnected connection", async () => {
		connectionRow = { ...baseConnection, disconnectedAt: new Date() };

		const result = await processDiscordInteraction(basePayload);

		expect(result.skipped).toBe(true);
		expect(runDiscordAgentMock).not.toHaveBeenCalled();
	});

	test("edits the deferred response with a fallback when the agent throws", async () => {
		runDiscordAgentMock.mockImplementation(async () => {
			throw new Error("agent boom");
		});

		const result = await processDiscordInteraction(basePayload);

		expect(editOriginalMock).toHaveBeenCalledTimes(1);
		const editArgs = editOriginalMock.mock.calls[0]?.[0] as { content: string };
		expect(editArgs.content).toBe("Sorry, I couldn't complete that.");
		expect(result).toEqual({ success: true, replied: false });
	});

	test("does not throw when the fallback edit also fails", async () => {
		runDiscordAgentMock.mockImplementation(async () => {
			throw new Error("agent boom");
		});
		editOriginalMock.mockImplementation(async () => {
			throw new Error("edit boom");
		});

		const result = await processDiscordInteraction(basePayload);

		expect(result.success).toBe(true);
		expect(result.replied).toBe(false);
	});
});
