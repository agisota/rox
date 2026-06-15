import { DEFAULT_TERMINAL_AGENT_TYPE } from "@rox/shared/agent-settings";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";

interface UseV2AgentChoicesResult {
	agents: AgentSelectAgent[];
	isFetched: boolean;
}

const ROX_AGENT: AgentSelectAgent = {
	id: "rox",
	label: "Rox",
	iconId: "rox",
};

export function getPreferredV2AgentId(
	agents: readonly AgentSelectAgent[],
): string | null {
	return (
		agents.find(
			(agent) => (agent.iconId ?? agent.id) === DEFAULT_TERMINAL_AGENT_TYPE,
		)?.id ??
		agents[0]?.id ??
		null
	);
}

// Rox chat isn't in the host's `host_agent_configs` table — it's
// routed by id inside `runAgentInWorkspace`. Append after the host's
// terminal rows so the user's preferred terminal agents stay on top.
export function useV2AgentChoices(
	hostUrl: string | null,
): UseV2AgentChoicesResult {
	const query = useV2AgentConfigs(hostUrl);
	const agents = useMemo<AgentSelectAgent[]>(() => {
		const terminalAgents: AgentSelectAgent[] = (query.data ?? []).map(
			(config) => ({
				id: config.id,
				label: config.label,
				iconId: config.presetId,
			}),
		);
		return [...terminalAgents, ROX_AGENT];
	}, [query.data]);

	return { agents, isFetched: query.isFetched };
}
