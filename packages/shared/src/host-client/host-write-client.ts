/**
 * Additive host WRITE plane (WS-A — Option A).
 *
 * The frozen {@link HostClient} (`./types.ts` + `./create-host-client.ts`) is a
 * READ-only convergence boundary: every method is a `GET`-or-`POST` query that
 * surfaces host state without mutating it. This module adds the symmetric WRITE
 * surface — chat sends, terminal input, and agent launches — as a SEPARATE,
 * purely additive {@link HostWriteClient} so the read contract stays byte-stable
 * (`types.ts` + `create-host-client.ts` end with an empty git diff).
 *
 * Both clients ride the SAME {@link HostTransport} seam: every write method is
 * exactly one `transport.call(procedure, input, "POST")`. No new HTTP verb and
 * no change to the {@link HostTransport} signature — the relay and ipc
 * transports already satisfy the writes because they already satisfy the reads.
 *
 * Decision (Option A): keep WRITE in its own client + factory rather than
 * widening `HostClient`. Reads and writes converge at the transport, not at the
 * type, so a write-capable consumer opts in via `createHostWriteClient` while
 * read-only screens keep importing the unchanged `createHostClient`.
 *
 * VERIFIED procedure mapping (checked against the host-service tRPC routers in
 * this checkout — each is a `.mutation`, i.e. POST):
 *
 * | write method        | procedure              | host input shape                                                  | router source        |
 * | ------------------- | ---------------------- | ----------------------------------------------------------------- | -------------------- |
 * | chat.sendMessage    | `chat.sendMessage`     | `{ sessionId, workspaceId, payload: { content, files? }, metadata? }` | chat.ts:57-73        |
 * | terminal.write      | `terminal.writeInput`  | `{ terminalId, workspaceId, data }`                               | terminal.ts:137-154  |
 * | agent.launch        | `agents.run`           | `{ workspaceId, agent, prompt, attachmentIds? }`                  | agents.ts:299-309    |
 *
 * Note: the host procedure for terminal input is `terminal.writeInput`, NOT
 * `terminal.write` — the namespace method is `write` but it maps to the host's
 * `writeInput` mutation. Inputs/outputs are hand-typed at the boundary for the
 * same reason as the read client: importing `@rox/host-service` would drag
 * host-only modules into a web/mobile type-check.
 */
import type { HostChatMessage, HostTarget, HostTransport } from "./types";

// HostChatMessage is imported to keep this module anchored to the same read
// contract surface it mirrors; referenced in the doc type below so the
// type-only import is load-bearing rather than dead.
type _ChatContractAnchor = HostChatMessage;

/**
 * Outcome of an {@link HostAgentWriteNamespace.launch} call. Hand-typed mirror
 * of the host's `AgentRunResult` discriminated union — the value the
 * `agents.run` mutation actually returns (host
 * `trpc/router/agents/agents.ts`:165-175). A `terminal` launch carries the
 * queued shell `command`; a `chat` launch does not. Kept as a boundary copy (no
 * import of `@rox/host-service`) for the same reason as the other hand-typed
 * host outputs: host-only modules must not leak into a web/mobile type-check.
 */
export type HostAgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string; command: string }
	| { kind: "chat"; sessionId: string; label: string };

/**
 * Result of {@link HostChatWriteNamespace.sendMessage}. The host's
 * `chat.sendMessage` mutation returns `RuntimeHarness.sendMessage`'s opaque
 * result (`runtime/chat/chat.ts:786-822`); like other hand-typed host outputs we
 * keep it boundary-opaque rather than re-deriving the harness's internal shape.
 */
export type HostChatSendResult = unknown;

/** Send a chat message to an existing host chat session (host: `chat.sendMessage`). */
export interface HostChatWriteNamespace {
	sendMessage(input: {
		sessionId: string;
		workspaceId: string;
		content: string;
		files?: Array<{ data: string; mediaType: string; filename?: string }>;
		metadata?: {
			model?: string;
			thinkingLevel?: "off" | "low" | "medium" | "high" | "xhigh";
		};
	}): Promise<HostChatSendResult>;
}

/** Write raw input to a host PTY terminal session (host: `terminal.writeInput`). */
export interface HostTerminalWriteNamespace {
	write(input: {
		terminalId: string;
		workspaceId: string;
		data: string;
	}): Promise<{ success: true }>;
}

/** Launch a configured agent in a host workspace (host: `agents.run`). */
export interface HostAgentWriteNamespace {
	launch(input: {
		workspaceId: string;
		agent: string;
		prompt: string;
		attachmentIds?: string[];
		/**
		 * Optional Agent-Native source the run is scoped to — the composer's
		 * `selectedSourceId` (an `agent_sources.id`). Threaded verbatim to the host
		 * `agents.run` mutation as a forward-channel. The actual source-attach
		 * consumer is the cloud rox-v2 proxy (`createProxyMcpServer` ->
		 * `AgentSourcePool.connectSelected`), which scopes a run to exactly this
		 * source — instead of the org's whole active set — when the agent's MCP
		 * request carries the id; the host `agents.run` path itself does not consume
		 * it. Purely additive: omitting it preserves the prior (sourceless / all
		 * active) behaviour, so the frozen READ contract and existing launch callers
		 * are untouched.
		 */
		sourceId?: string;
	}): Promise<HostAgentRunResult>;
}

/**
 * The additive host WRITE surface. Transport-agnostic exactly like
 * {@link import("./types").HostClient}: the same interface is returned whether
 * the underlying transport is `relay` or `ipc`.
 */
export interface HostWriteClient {
	readonly target: HostTarget;
	readonly transport: HostTransport;
	chat: HostChatWriteNamespace;
	terminal: HostTerminalWriteNamespace;
	agent: HostAgentWriteNamespace;
}

/**
 * Build the additive {@link HostWriteClient} over any {@link HostTransport}.
 * Each method is exactly one `transport.call(procedure, input, "POST")` against
 * the VERIFIED procedure strings above. Mirrors `createHostClient` so a
 * write-capable consumer can do
 * `createHostWriteClient(transport).chat.sendMessage(...)`.
 */
export function createHostWriteClient(
	transport: HostTransport,
): HostWriteClient {
	return {
		target: transport.target,
		transport,
		chat: {
			sendMessage(input) {
				return transport.call<HostChatSendResult>(
					"chat.sendMessage",
					{
						sessionId: input.sessionId,
						workspaceId: input.workspaceId,
						payload: { content: input.content, files: input.files },
						metadata: input.metadata,
					},
					"POST",
				);
			},
		},
		terminal: {
			write(input) {
				return transport.call<{ success: true }>(
					"terminal.writeInput",
					{
						terminalId: input.terminalId,
						workspaceId: input.workspaceId,
						data: input.data,
					},
					"POST",
				);
			},
		},
		agent: {
			launch(input) {
				return transport.call<HostAgentRunResult>(
					"agents.run",
					{
						workspaceId: input.workspaceId,
						agent: input.agent,
						prompt: input.prompt,
						attachmentIds: input.attachmentIds,
						// Additive run-scoping field: forwarded only when set so the host
						// input stays byte-identical for existing sourceless callers.
						...(input.sourceId ? { sourceId: input.sourceId } : {}),
					},
					"POST",
				);
			},
		},
	};
}
