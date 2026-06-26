/**
 * Live on-canvas run trace. Owns the currently-watched run id and polls
 * `pipeline.getRun` while that run is in a live status (queued/running/
 * waiting_approval), projecting its steps into a `blockId -> status` map the
 * editor overlays onto the canvas nodes (dify/sim run-trace parity).
 *
 * The active run id is lifted here (shared by the toolbar run button, which sets
 * it on a fresh run, and the RunMonitorPanel, which sets it when the user opens a
 * historical run) so the canvas and the panel always agree on what is shown.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";

/** A run is "live" while queued/running/waiting — poll those for step updates. */
const LIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_approval"]);
const POLL_MS = 1500;

export type RunTrace = {
	/** blockId -> step status for the watched run (empty when none active). */
	runStatusByBlockId: Record<string, string>;
	/** The run currently visualised on the canvas (or null). */
	activeRunId: string | null;
	setActiveRunId: (runId: string | null) => void;
	/** Whether the watched run is still live (polling). */
	isLive: boolean;
};

export function useRunTrace(pipelineId: string): RunTrace {
	const trpc = useTRPC();
	const [activeRunId, setActiveRunId] = useState<string | null>(null);

	const runDetailQuery = useQuery({
		...trpc.pipeline.getRun.queryOptions({
			pipelineId,
			runId: activeRunId ?? "",
		}),
		enabled: activeRunId != null,
		refetchInterval: (query) => {
			const status = query.state.data?.run.status;
			return status && LIVE_RUN_STATUSES.has(status) ? POLL_MS : false;
		},
	});

	const detail = runDetailQuery.data;

	const runStatusByBlockId = useMemo(() => {
		const map: Record<string, string> = {};
		if (!detail) return map;
		for (const step of detail.steps) {
			if (step.blockId) map[step.blockId] = step.status;
		}
		return map;
	}, [detail]);

	const isLive = detail ? LIVE_RUN_STATUSES.has(detail.run.status) : false;

	return { runStatusByBlockId, activeRunId, setActiveRunId, isLive };
}
