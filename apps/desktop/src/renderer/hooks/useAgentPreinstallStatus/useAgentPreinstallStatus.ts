import type { PreinstallStatusEntry } from "@rox/host-service/settings";
import { ODW_OMP_HARNESS_ID } from "@rox/shared/agent-harness-presets";
import { DEFAULT_TERMINAL_AGENT_TYPE } from "@rox/shared/agent-settings";
import { useQuery } from "@tanstack/react-query";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const AGENT_PREINSTALL_STATUS_QUERY_KEY = [
	"agent-preinstall-status",
] as const;

export type OmpOdwHarnessState =
	| "unavailable"
	| "off"
	| "installing"
	| "ready"
	| "failed";

export function useAgentPreinstallStatus(hostUrl: string | null) {
	return useQuery({
		queryKey: [...AGENT_PREINSTALL_STATUS_QUERY_KEY, hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as PreinstallStatusEntry[];
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentPreinstall.status.query();
		},
		refetchInterval: (query) =>
			query.state.data?.some((entry) => entry.status === "installing")
				? 1000
				: false,
		staleTime: 2000,
	});
}

export function getOmpOdwHarnessEntry(
	entries: readonly PreinstallStatusEntry[] | undefined,
): PreinstallStatusEntry | null {
	return (
		entries?.find((entry) => entry.presetId === ODW_OMP_HARNESS_ID) ?? null
	);
}

export function getOmpOdwHarnessState(
	entry: PreinstallStatusEntry | null | undefined,
): OmpOdwHarnessState {
	if (!entry) return "unavailable";
	if (entry.status === "installed") return "ready";
	if (entry.status === "installing") return "installing";
	if (entry.status === "failed") return "failed";
	return "off";
}

export function isOmpAgent(
	agent: AgentSelectAgent | null | undefined,
): boolean {
	return (agent?.iconId ?? agent?.id) === DEFAULT_TERMINAL_AGENT_TYPE;
}
