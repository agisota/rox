import type { PreinstallStatusEntry } from "@rox/host-service/settings";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const AGENT_PREINSTALL_QUERY_KEY = ["host-agent-preinstall"] as const;

export function agentPreinstallQueryKey(hostUrl: string | null) {
	return [...AGENT_PREINSTALL_QUERY_KEY, hostUrl] as const;
}

/**
 * `true` while any catalog item is mid-install — the section polls in this
 * state so progress and final status surface without a manual refresh.
 */
function isInstallInFlight(entries: PreinstallStatusEntry[] | undefined) {
	return entries?.some((entry) => entry.status === "installing") ?? false;
}

export interface UseAgentPreinstallResult {
	entries: PreinstallStatusEntry[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	/** Catalog items still awaiting a (non-skipped) install. */
	pendingCount: number;
	/** Items that failed their last install attempt. */
	failedCount: number;
	isInstalling: boolean;
	runAll: () => void;
	retry: (presetId: string) => void;
	skip: (presetId: string) => void;
	isRunningAll: boolean;
	pendingActionPresetId: string | null;
}

/**
 * Drives the bundled agent/harness preinstaller from the renderer. Reads
 * persisted status, polls while installs are in flight, and exposes
 * run/retry/skip mutations that invalidate the status query so the UI
 * converges on the host-service's recorded state. Caller passes the host URL
 * explicitly so this works for any targeted host (mirrors `useV2AgentConfigs`).
 */
export function useAgentPreinstall(
	hostUrl: string | null,
): UseAgentPreinstallResult {
	const queryClient = useQueryClient();
	const queryKey = agentPreinstallQueryKey(hostUrl);

	const statusQuery = useQuery({
		queryKey,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as PreinstallStatusEntry[];
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentPreinstall.status.query();
		},
		// Poll while installs run; idle otherwise so we don't hammer the host.
		refetchInterval: (query) =>
			isInstallInFlight(query.state.data) ? 1500 : false,
	});

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey });
	};

	const runAllMutation = useMutation({
		mutationFn: () => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentPreinstall.run.mutate();
		},
		onSuccess: invalidate,
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to start installs",
			),
	});

	const retryMutation = useMutation({
		mutationFn: (presetId: string) => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentPreinstall.retry.mutate({ presetId });
		},
		onSuccess: invalidate,
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to retry"),
	});

	const skipMutation = useMutation({
		mutationFn: (presetId: string) => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentPreinstall.skip.mutate({ presetId });
		},
		onSuccess: invalidate,
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to skip"),
	});

	const entries = statusQuery.data ?? [];
	const pendingCount = entries.filter(
		(entry) => entry.status === "pending",
	).length;
	const failedCount = entries.filter(
		(entry) => entry.status === "failed",
	).length;

	return {
		entries,
		isLoading: statusQuery.isLoading,
		isError: statusQuery.isError,
		error: statusQuery.error,
		pendingCount,
		failedCount,
		isInstalling: isInstallInFlight(entries),
		runAll: () => runAllMutation.mutate(),
		retry: (presetId) => retryMutation.mutate(presetId),
		skip: (presetId) => skipMutation.mutate(presetId),
		isRunningAll: runAllMutation.isPending,
		pendingActionPresetId:
			retryMutation.isPending && typeof retryMutation.variables === "string"
				? retryMutation.variables
				: skipMutation.isPending && typeof skipMutation.variables === "string"
					? skipMutation.variables
					: null,
	};
}
