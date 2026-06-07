import type {
	ExecutionCircuitSpec,
	TransitionRunStatus,
	TransitionSpec,
} from "./schemas";

export type TransitionRunSummary = {
	transitionId: string;
	status: TransitionRunStatus;
	createdAt?: number;
	updatedAt?: number;
};

export type TransitionGraphNodeStatus = "completed" | "available" | "blocked";

export type TransitionGraphNode = {
	transitionId: string;
	name: string;
	fromStateId: string;
	toStateId: string;
	status: TransitionGraphNodeStatus;
	blockingStateIds: string[];
	runCount: number;
	latestRunStatus?: TransitionRunStatus;
};

export type TransitionGraphPlan = {
	orderedTransitionIds: string[];
	reachableStateIds: string[];
	completedTransitionIds: string[];
	nextTransitionId: string | null;
	nodes: TransitionGraphNode[];
};

function sortRunsByFreshness(
	left: TransitionRunSummary,
	right: TransitionRunSummary,
) {
	return (
		(right.updatedAt ?? right.createdAt ?? 0) -
		(left.updatedAt ?? left.createdAt ?? 0)
	);
}

function getCompletedTransitionIds(runs: TransitionRunSummary[]) {
	return new Set(
		runs
			.filter((run) => run.status === "completed")
			.map((run) => run.transitionId),
	);
}

function getLatestRunsByTransition(runs: TransitionRunSummary[]) {
	const map = new Map<string, TransitionRunSummary>();

	for (const run of [...runs].sort(sortRunsByFreshness)) {
		if (!map.has(run.transitionId)) {
			map.set(run.transitionId, run);
		}
	}

	return map;
}

function computeReachableStates(
	spec: ExecutionCircuitSpec,
	completedTransitionIds: Set<string>,
) {
	const reachableStateIds = new Set([spec.currentState.id]);

	let madeProgress = true;
	while (madeProgress) {
		madeProgress = false;
		for (const transition of spec.transitions) {
			if (
				completedTransitionIds.has(transition.id) &&
				reachableStateIds.has(transition.fromStateId) &&
				!reachableStateIds.has(transition.toStateId)
			) {
				reachableStateIds.add(transition.toStateId);
				madeProgress = true;
			}
		}
	}

	return reachableStateIds;
}

function orderTransitionsFromCurrentState(spec: ExecutionCircuitSpec) {
	const ordered: TransitionSpec[] = [];
	const orderedIds = new Set<string>();
	const reachableStateIds = new Set([spec.currentState.id]);

	let madeProgress = true;
	while (madeProgress) {
		madeProgress = false;
		for (const transition of spec.transitions) {
			if (
				!orderedIds.has(transition.id) &&
				reachableStateIds.has(transition.fromStateId)
			) {
				ordered.push(transition);
				orderedIds.add(transition.id);
				reachableStateIds.add(transition.toStateId);
				madeProgress = true;
			}
		}
	}

	for (const transition of spec.transitions) {
		if (!orderedIds.has(transition.id)) {
			ordered.push(transition);
			orderedIds.add(transition.id);
		}
	}

	return ordered;
}

export function planExecutionCircuitGraph(
	spec: ExecutionCircuitSpec,
	runs: TransitionRunSummary[] = [],
): TransitionGraphPlan {
	const completedTransitionIds = getCompletedTransitionIds(runs);
	const latestRunsByTransition = getLatestRunsByTransition(runs);
	const reachableStateIds = computeReachableStates(
		spec,
		completedTransitionIds,
	);
	const orderedTransitions = orderTransitionsFromCurrentState(spec);

	const nodes = orderedTransitions.map((transition): TransitionGraphNode => {
		const latestRun = latestRunsByTransition.get(transition.id);
		const runCount = runs.filter(
			(run) => run.transitionId === transition.id,
		).length;
		const isCompleted = completedTransitionIds.has(transition.id);
		const isAvailable = reachableStateIds.has(transition.fromStateId);

		return {
			transitionId: transition.id,
			name: transition.name,
			fromStateId: transition.fromStateId,
			toStateId: transition.toStateId,
			status: isCompleted ? "completed" : isAvailable ? "available" : "blocked",
			blockingStateIds: isAvailable ? [] : [transition.fromStateId],
			runCount,
			latestRunStatus: latestRun?.status,
		};
	});

	const nextTransitionId =
		nodes.find((node) => node.status === "available")?.transitionId ?? null;

	return {
		orderedTransitionIds: orderedTransitions.map((transition) => transition.id),
		reachableStateIds: [...reachableStateIds],
		completedTransitionIds: [...completedTransitionIds],
		nextTransitionId,
		nodes,
	};
}
