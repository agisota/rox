import { describe, expect, it } from "bun:test";
import type { ExecutionCircuitSpec } from "@superset/shared/execution-circuit";
import {
	getExecutionCircuitPanelSmokeState,
	getLatestRunsByTransition,
} from "./ExecutionCircuitPanel.state";

function spec(): ExecutionCircuitSpec {
	return {
		version: 1,
		id: "circuit-1",
		taskId: "task-1",
		title: "Execution Circuit",
		status: "ready",
		currentState: {
			id: "current",
			name: "Current",
			description: "Current state.",
			assertions: ["Task exists."],
		},
		targetState: {
			id: "target",
			name: "Target",
			description: "Target state.",
			assertions: ["Task done."],
		},
		intermediateStates: [],
		transitions: [
			{
				id: "transition-1",
				name: "Transition 1",
				description: "Move current to target.",
				fromStateId: "current",
				toStateId: "target",
				requiredEvents: [
					{
						id: "event-1",
						name: "Event 1",
						description: "Observed event.",
						required: true,
					},
				],
				runtime: { kind: "unspecified" },
				monad: {
					contextRefs: ["task:task-1"],
					tools: ["repo search"],
					permissions: ["read"],
					constraints: ["Keep scope small."],
					memoryRefs: [],
					qualityCriteria: ["Tests pass."],
				},
				outputContract: {
					format: "json",
					requiredFields: ["transition_id", "status"],
				},
				validators: [
					{
						kind: "manual",
						description: "Review evidence.",
						required: true,
					},
				],
			},
		],
	};
}

describe("ExecutionCircuitPanel smoke state", () => {
	it("shows create action when no circuit exists", () => {
		const state = getExecutionCircuitPanelSmokeState(null);

		expect(state.primaryActions).toEqual(["Create Execution Circuit"]);
	});

	it("shows save, copy, import/export, and start controls for an existing circuit", () => {
		const state = getExecutionCircuitPanelSmokeState({
			id: "circuit-1",
			specJson: spec(),
			transitionRuns: [],
		});

		expect(state.primaryActions).toEqual([
			"Start next transition",
			"Export JSON",
			"Import JSON",
			"Save spec",
		]);
		expect(state.transitionActions["transition-1"]).toEqual([
			"Start run",
			"Copy agent prompt",
		]);
		expect(state.nextTransitionId).toBe("transition-1");
	});

	it("shows validator action when a transition run exists", () => {
		const state = getExecutionCircuitPanelSmokeState({
			id: "circuit-1",
			specJson: spec(),
			transitionRuns: [
				{
					id: "run-1",
					transitionId: "transition-1",
					status: "pending",
					createdAt: 1,
					updatedAt: 1,
				},
			],
		});

		expect(state.transitionActions["transition-1"]).toContain("Run validators");
	});

	it("uses the newest transition run for each transition", () => {
		const latestRuns = getLatestRunsByTransition([
			{
				id: "old-run",
				transitionId: "transition-1",
				status: "failed",
				createdAt: 1,
				updatedAt: 1,
			},
			{
				id: "new-run",
				transitionId: "transition-1",
				status: "pending",
				createdAt: 2,
				updatedAt: 3,
			},
		]);

		expect(latestRuns.get("transition-1")?.id).toBe("new-run");
	});
});
