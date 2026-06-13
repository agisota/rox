import {
	createUiCommandEnvelope,
	parseUiCommandAckEnvelope,
	uiCommandSchema,
} from "@rox/agent-bridge/commands";
import { parseContextEnvelope } from "@rox/agent-bridge/context";
import { createEmbedRequestId } from "@rox/agent-bridge/protocol";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";

const ACK_TIMEOUT_MS = 10_000;

/**
 * Agent-aware bridge: lets external CLI agents (via MCP) read the screen the
 * user is looking at and drive it with a whitelisted set of UI commands.
 *
 *   renderer --publishContext--> registry <--getContext-- MCP tool
 *   MCP tool --sendUiCommand--> event bus --> renderer --ackUiCommand--> ack
 *
 * All renderer-facing payloads use the `agent-native.embed` v1 envelope from
 * `@rox/agent-bridge` so future embedded surfaces / A2A slices share the
 * same wire format.
 */
export const agentBridgeRouter = router({
	/**
	 * Renderer → host: publish the current screen context for a workspace.
	 * Input is a `rox.screen-context` MESSAGE envelope; the packet inside is
	 * validated against the strict whitelist schema and rejected wholesale on
	 * any unexpected field.
	 */
	publishContext: protectedProcedure
		.input(z.object({ envelope: z.unknown() }))
		.mutation(({ ctx, input }) => {
			const parsed = parseContextEnvelope(input.envelope);
			if (!parsed.ok) {
				throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error });
			}
			ctx.agentBridge.setContext(parsed.packet);
			return { ok: true as const, workspaceId: parsed.packet.workspaceId };
		}),

	/**
	 * MCP/host → registry: last-known screen context for a workspace. Returns
	 * `found: false` when the workspace has never published (renderer closed
	 * or workspace not open on screen).
	 */
	getContext: protectedProcedure
		.input(z.object({ workspaceId: z.string().min(1) }))
		.query(({ ctx, input }) => {
			const stored = ctx.agentBridge.getContext(input.workspaceId);
			if (!stored) {
				return { found: false as const };
			}
			return {
				found: true as const,
				packet: stored.packet,
				receivedAt: stored.receivedAt,
				ageMs: Date.now() - stored.receivedAt,
			};
		}),

	/**
	 * MCP → renderer: execute a whitelisted UI command in the workspace's
	 * renderer and wait for the ack. The command is wrapped in a
	 * `rox.ui-command` REQUEST envelope, fanned out over the event bus, and
	 * resolved when the renderer acks (or after 10s).
	 */
	sendUiCommand: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				command: uiCommandSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const requestId = createEmbedRequestId();
			const envelope = createUiCommandEnvelope(input.command, requestId);
			const ack = ctx.agentBridge.waitForAck(requestId, ACK_TIMEOUT_MS);
			ctx.eventBus.broadcastAgentBridgeUiCommand({
				workspaceId: input.workspaceId,
				envelope,
			});
			const result = await ack;
			return { requestId, ...result };
		}),

	/**
	 * Renderer → host: ack a UI command. Input is the `rox.ui-command`
	 * RESPONSE envelope produced by `createUiCommandAckEnvelope`.
	 */
	ackUiCommand: protectedProcedure
		.input(z.object({ envelope: z.unknown() }))
		.mutation(({ ctx, input }) => {
			const parsed = parseUiCommandAckEnvelope(input.envelope);
			if (!parsed.ok) {
				throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error });
			}
			const resolved = ctx.agentBridge.resolveAck(
				parsed.requestId,
				parsed.result,
			);
			return { ok: true as const, resolved };
		}),
});
