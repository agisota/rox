import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextPacket } from "@rox/agent-bridge/context";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

type GetContextResult =
	| { found: false }
	| { found: true; packet: ContextPacket; receivedAt: number; ageMs: number };

export function register(server: McpServer): void {
	defineTool(server, {
		name: "rox_get_screen_context",
		description:
			"Read the screen the user is currently looking at in the Rox app for a workspace: current route, active workspace id, and any text the user has selected. Returns found=false when the workspace is not open in the app. Context is scoped to the requested workspace — use this before navigating or referencing on-screen state.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID to read screen context for."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const workspace = await caller.v2Workspace.getFromHost({
				organizationId: ctx.organizationId,
				id: input.workspaceId,
			});
			if (!workspace) {
				throw new Error(`Workspace not found: ${input.workspaceId}`);
			}

			return hostServiceCall<GetContextResult>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"agentBridge.getContext",
				"query",
				{ workspaceId: input.workspaceId },
			);
		},
	});
}
