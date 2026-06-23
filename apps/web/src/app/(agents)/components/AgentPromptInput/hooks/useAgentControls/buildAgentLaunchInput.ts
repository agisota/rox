import type { AgentSourceOption } from "./types";

/**
 * Input to the host write seam's `HostWriteClient.agent.launch` (→ host
 * `agents.run`). Hand-typed here to avoid importing `@rox/shared/host-client`
 * into this composer-state module; it is the subset the launcher fills.
 */
export interface AgentLaunchInput {
	workspaceId: string;
	agent: string;
	prompt: string;
	/** The composer-selected Agent-Native source id, when one is chosen. */
	sourceId?: string;
}

/**
 * Map the composer's selected source onto an agent launch input. This is the
 * composer-side mapping for the run-scoping forward-channel: `useAgentControls`
 * owns `selectedSource` (a `SourceSelector` choice), and `buildAgentLaunchInput`
 * places it on the `agents.run` launch input as `sourceId`. The host forwards it
 * verbatim; the value is ultimately consumed at the cloud rox-v2 proxy
 * (`AgentSourcePool.connectSelected`) only when the agent's MCP request carries
 * the id.
 *
 * NOTE: this helper is not yet wired into a live launch — the mounted prompt
 * composer is preview-only (the active follow-up input uses `chat.sendMessage`),
 * so no production run emits `sourceId` through this path today. It is kept pure
 * + dependency-free and unit-tested so the seam is ready when a live caller
 * adopts it. When no source is selected the `sourceId` field is omitted entirely,
 * preserving the prior sourceless launch shape (host input byte-identical for the
 * no-source path).
 */
export function buildAgentLaunchInput(args: {
	workspaceId: string;
	agent: string;
	prompt: string;
	selectedSource: AgentSourceOption | null;
}): AgentLaunchInput {
	const { workspaceId, agent, prompt, selectedSource } = args;
	return {
		workspaceId,
		agent,
		prompt,
		...(selectedSource ? { sourceId: selectedSource.id } : {}),
	};
}
