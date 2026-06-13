import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UiCommandResult } from "@rox/agent-bridge/commands";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "rox_ui_command",
		description:
			"Drive the Rox app screen for a workspace. Currently supports a single allow-listed command: navigate (move the app to an in-app route, e.g. /v2-workspace/<id>). The command is executed by the user's renderer and acked back; fails if the workspace is not open in the app.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID whose renderer should run the command."),
			command: z
				.literal("navigate")
				.describe("Command to run. Only `navigate` is allow-listed."),
			route: z
				.string()
				.min(1)
				.startsWith("/")
				.describe(
					"Absolute in-app route to navigate to, e.g. /v2-workspace/<workspaceId> or /settings.",
				),
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

			return hostServiceCall<UiCommandResult & { requestId: string }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"agentBridge.sendUiCommand",
				"mutation",
				{
					workspaceId: input.workspaceId,
					command: { kind: input.command, route: input.route },
				},
			);
		},
	});
}
