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
 * Thread the composer's selected source into an agent launch. THIS is the
 * run-wiring seam on the composer side: `useAgentControls` owns `selectedSource`
 * (a `SourceSelector` choice) but, before this, nothing carried it into a run.
 * `buildAgentLaunchInput` maps that selection onto the `agents.run` launch input
 * as `sourceId`, so the host forwards it and the runtime's `AgentSourcePool
 * .connectSelected` resolves + attaches exactly that source to the run.
 *
 * Pure + dependency-free so the seam is unit-testable without a relay/host. When
 * no source is selected the `sourceId` field is omitted entirely, preserving the
 * prior sourceless launch shape (the host input stays byte-identical for the
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
