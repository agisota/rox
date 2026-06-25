/**
 * Shared helper that maps a live run step status onto the canvas node's ring +
 * animation classes, so every node type lights up identically during a run
 * (dify/sim run-trace parity). The editor stamps `data.runStatus` onto each node
 * from the polled `getRun` steps; nodes call {@link runStatusClass} to render it.
 *
 * sim.ai run-trace parity (#594, cross-ref #525 — NOT duplicated here): the
 * on-canvas overlay this drives already matches sim's run visual language —
 * `running` pulses (sky), `waiting_approval` pulses (amber) for the inline
 * human-approve gate, and `succeeded` settles to an emerald ring. #594 confirms
 * this match rather than adding a second overlay; the inline approve action lives
 * in `ApprovalNode`/`RunMonitorPanel`. Pattern borrowed from simstudioai/sim
 * (Apache-2.0), implemented fresh.
 */

import type { PipelineNodeData } from "../graph-adapter";

/** The subset of step statuses we visualise on the canvas. */
export type NodeRunStatus =
	| "running"
	| "succeeded"
	| "failed"
	| "waiting_approval"
	| "pending";

/**
 * Tailwind classes for a node's run state. `running` and `waiting_approval`
 * pulse; terminal states get a solid coloured ring. Returns the selection ring
 * when `selected` and there is no active run state (keeps the existing
 * select-affordance unchanged when nothing is running).
 */
export function runStatusClass(
	data: Pick<PipelineNodeData, "runStatus">,
	selected: boolean | undefined,
): string | undefined {
	const status = data.runStatus as NodeRunStatus | undefined;
	switch (status) {
		case "running":
			return "ring-2 ring-sky-500 animate-pulse";
		case "waiting_approval":
			return "ring-2 ring-amber-500 animate-pulse";
		case "succeeded":
			return "ring-2 ring-emerald-500";
		case "failed":
			return "ring-2 ring-destructive";
		default:
			return selected ? "ring-2 ring-primary" : undefined;
	}
}
