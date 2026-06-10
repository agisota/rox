import {
	type ExecutionCircuitSpec,
	planExecutionCircuitGraph,
	type TransitionGraphPlan,
	type TransitionRunStatus,
} from "@rox/shared/execution-circuit";

export type ExecutionCircuitPanelRun = {
	id: string;
	transitionId: string;
	status: TransitionRunStatus;
	createdAt: number;
	updatedAt: number;
};

export type ExecutionCircuitPanelCircuit = {
	id: string;
	specJson: ExecutionCircuitSpec;
	transitionRuns: ExecutionCircuitPanelRun[];
};

export type ExecutionCircuitPanelSmokeState = {
	primaryActions: string[];
	transitionActions: Record<string, string[]>;
	nextTransitionId: string | null;
};

export function getLatestRunsByTransition<T extends ExecutionCircuitPanelRun>(
	runs: T[],
) {
	const map = new Map<string, T>();

	for (const run of [...runs].sort(
		(left, right) => right.updatedAt - left.updatedAt,
	)) {
		if (!map.has(run.transitionId)) {
			map.set(run.transitionId, run);
		}
	}

	return map;
}

export function getExecutionCircuitGraphPlan(
	circuit: ExecutionCircuitPanelCircuit,
): TransitionGraphPlan {
	return planExecutionCircuitGraph(
		circuit.specJson,
		circuit.transitionRuns.map((run) => ({
			transitionId: run.transitionId,
			status: run.status,
			createdAt: run.createdAt,
			updatedAt: run.updatedAt,
		})),
	);
}

export function getExecutionCircuitPanelSmokeState(
	circuit: ExecutionCircuitPanelCircuit | null,
): ExecutionCircuitPanelSmokeState {
	if (!circuit) {
		return {
			primaryActions: ["Create Execution Circuit"],
			transitionActions: {},
			nextTransitionId: null,
		};
	}

	const latestRunsByTransition = getLatestRunsByTransition(
		circuit.transitionRuns,
	);
	const graph = getExecutionCircuitGraphPlan(circuit);
	const transitionActions = Object.fromEntries(
		circuit.specJson.transitions.map((transition) => {
			const actions = ["Start run", "Copy agent prompt"];
			if (latestRunsByTransition.has(transition.id)) {
				actions.push("Run validators");
			}
			return [transition.id, actions];
		}),
	);

	return {
		primaryActions: [
			"Start next transition",
			"Export JSON",
			"Import JSON",
			"Save spec",
		],
		transitionActions,
		nextTransitionId: graph.nextTransitionId,
	};
}
