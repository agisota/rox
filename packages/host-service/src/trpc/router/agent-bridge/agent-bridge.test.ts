import { describe, expect, it, mock } from "bun:test";
import {
	createUiCommandAckEnvelope,
	parseUiCommandEnvelope,
} from "@rox/agent-bridge/commands";
import {
	buildContextPacket,
	createContextEnvelope,
} from "@rox/agent-bridge/context";
import type { AgentNativeEmbedEnvelope } from "@rox/agent-bridge/protocol";
import { AgentBridgeRegistry } from "../../../agent-bridge";
import type { HostServiceContext } from "../../../types";
import { agentBridgeRouter } from "./agent-bridge";

interface BroadcastedUiCommand {
	workspaceId: string;
	envelope: AgentNativeEmbedEnvelope;
}

function createContext(): {
	ctx: HostServiceContext;
	agentBridge: AgentBridgeRegistry;
	broadcastAgentBridgeUiCommand: ReturnType<
		typeof mock<(message: BroadcastedUiCommand) => void>
	>;
} {
	const agentBridge = new AgentBridgeRegistry();
	const broadcastAgentBridgeUiCommand = mock(
		(_message: BroadcastedUiCommand) => {},
	);
	const ctx = {
		agentBridge,
		eventBus: { broadcastAgentBridgeUiCommand },
		isAuthenticated: true,
	} as unknown as HostServiceContext;
	return { ctx, agentBridge, broadcastAgentBridgeUiCommand };
}

function contextEnvelope(workspaceId: string, selectionText?: string) {
	return createContextEnvelope(
		buildContextPacket({
			workspaceId,
			route: { pathname: `/v2-workspace/${workspaceId}` },
			...(selectionText !== undefined ? { selectionText } : {}),
		}),
	);
}

describe("agentBridgeRouter publishContext/getContext", () => {
	it("stores and returns the last packet per workspace", async () => {
		const { ctx } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		const published = await caller.publishContext({
			envelope: contextEnvelope("ws-1", "selected text"),
		});
		expect(published).toEqual({ ok: true, workspaceId: "ws-1" });

		const result = await caller.getContext({ workspaceId: "ws-1" });
		if (!result.found) throw new Error("expected found context");
		expect(result.packet.workspaceId).toBe("ws-1");
		expect(result.packet.route.pathname).toBe("/v2-workspace/ws-1");
		expect(result.packet.selection?.text).toBe("selected text");
		expect(result.ageMs).toBeGreaterThanOrEqual(0);
	});

	it("scopes contexts per workspace and reports missing ones", async () => {
		const { ctx } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		await caller.publishContext({ envelope: contextEnvelope("ws-1") });

		expect(await caller.getContext({ workspaceId: "ws-other" })).toEqual({
			found: false,
		});
	});

	it("newer publications replace older ones", async () => {
		const { ctx } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		await caller.publishContext({ envelope: contextEnvelope("ws-1", "old") });
		await caller.publishContext({ envelope: contextEnvelope("ws-1", "new") });

		const result = await caller.getContext({ workspaceId: "ws-1" });
		if (!result.found) throw new Error("expected found context");
		expect(result.packet.selection?.text).toBe("new");
	});

	it("rejects payloads outside the context whitelist", async () => {
		const { ctx } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		await expect(
			caller.publishContext({
				envelope: {
					protocol: "agent-native.embed",
					version: 1,
					type: "message",
					name: "rox.screen-context",
					payload: {
						workspaceId: "ws-1",
						route: { pathname: "/a" },
						capturedAt: 1,
						secrets: { TOKEN: "leak" },
					},
				},
			}),
		).rejects.toThrow(/invalid context packet/);
	});
});

describe("agentBridgeRouter sendUiCommand/ackUiCommand", () => {
	it("broadcasts an envelope and resolves on renderer ack", async () => {
		const { ctx, broadcastAgentBridgeUiCommand } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		const pending = caller.sendUiCommand({
			workspaceId: "ws-1",
			command: { kind: "navigate", route: "/v2-workspace/ws-2" },
		});

		// Wait for the broadcast, then ack like the renderer would.
		await Bun.sleep(5);
		expect(broadcastAgentBridgeUiCommand).toHaveBeenCalledTimes(1);
		const message = broadcastAgentBridgeUiCommand.mock.calls[0]?.[0];
		expect(message?.workspaceId).toBe("ws-1");

		const parsed = parseUiCommandEnvelope(message?.envelope);
		if (!parsed.ok) throw new Error(`unparseable envelope: ${parsed.error}`);
		expect(parsed.command).toEqual({
			kind: "navigate",
			route: "/v2-workspace/ws-2",
		});

		await caller.ackUiCommand({
			envelope: createUiCommandAckEnvelope(parsed.requestId, { ok: true }),
		});

		const result = await pending;
		expect(result).toEqual({ requestId: parsed.requestId, ok: true });
	});

	it("propagates renderer-side failures", async () => {
		const { ctx, broadcastAgentBridgeUiCommand } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		const pending = caller.sendUiCommand({
			workspaceId: "ws-1",
			command: { kind: "navigate", route: "/nope" },
		});
		await Bun.sleep(5);
		const message = broadcastAgentBridgeUiCommand.mock.calls[0]?.[0];
		const parsed = parseUiCommandEnvelope(message?.envelope);
		if (!parsed.ok) throw new Error("unparseable envelope");

		await caller.ackUiCommand({
			envelope: createUiCommandAckEnvelope(parsed.requestId, {
				ok: false,
				error: "route not found",
			}),
		});

		const result = await pending;
		expect(result.ok).toBe(false);
		expect(result.error).toBe("route not found");
	});

	it("rejects commands outside the allow-list before broadcasting", async () => {
		const { ctx, broadcastAgentBridgeUiCommand } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		await expect(
			caller.sendUiCommand({
				workspaceId: "ws-1",
				// @ts-expect-error -- intentionally outside the allow-list
				command: { kind: "execShell", command: "rm -rf /" },
			}),
		).rejects.toThrow();
		expect(broadcastAgentBridgeUiCommand).not.toHaveBeenCalled();
	});

	it("acks for unknown request ids resolve nothing", async () => {
		const { ctx } = createContext();
		const caller = agentBridgeRouter.createCaller(ctx);

		const result = await caller.ackUiCommand({
			envelope: createUiCommandAckEnvelope("embed-unknown", { ok: true }),
		});
		expect(result).toEqual({ ok: true, resolved: false });
	});
});

describe("AgentBridgeRegistry.waitForAck", () => {
	it("times out with a descriptive error", async () => {
		const registry = new AgentBridgeRegistry();
		const result = await registry.waitForAck("embed-x", 10);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/timed out after 10ms/);
	});

	it("close() flushes pending commands", async () => {
		const registry = new AgentBridgeRegistry();
		const pending = registry.waitForAck("embed-y", 5_000);
		registry.close();
		const result = await pending;
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/shutting down/);
	});
});
