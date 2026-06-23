/**
 * Deterministic execution planner for a circuit. Given a valid (or partially
 * valid) {@link ExecutionCircuitSpec}, compute the ordered transition path that
 * drives the circuit from its `initialState` to its `targetState`.
 *
 * This is the "planner" half of the execution circuit: the run service walks
 * the returned {@link ExecutionPlanStep}s in order, compiling + executing one
 * transition at a time. The function is pure and deterministic — it performs a
 * breadth-first search with stable, id-sorted tie-breaking so the same circuit
 * always yields byte-identical plans (asserted via tests). It never throws on a
 * malformed spec; unreachable / undeclared states are reported via
 * `reachable: false` so callers can surface diagnostics instead of crashing.
 */

import type { ExecutionCircuitSpec, TransitionSpec } from "./types";

/** One step of a planned execution: a single transition to fire. */
export interface ExecutionPlanStep {
	transitionId: string;
	from: string;
	to: string;
	label?: string;
}

/** The result of planning a path from `initialState` to `targetState`. */
export interface ExecutionPlan {
	/** True when `targetState` is reachable from `initialState`. */
	reachable: boolean;
	/** Whether the circuit already starts at the target (empty plan). */
	atTarget: boolean;
	/** Ordered transitions to fire; empty when already at target or unreachable. */
	steps: ExecutionPlanStep[];
	/** State ids along the planned path, starting with `initialState`. */
	statePath: string[];
	/** All state ids reachable from `initialState`, sorted for stability. */
	reachableStates: string[];
}

/** Build a state-id → outgoing-transitions map with id-sorted, deduped edges. */
function buildAdjacency(
	transitions: TransitionSpec[],
): Map<string, TransitionSpec[]> {
	const byFrom = new Map<string, TransitionSpec[]>();
	for (const transition of transitions) {
		const list = byFrom.get(transition.from);
		if (list) {
			list.push(transition);
		} else {
			byFrom.set(transition.from, [transition]);
		}
	}
	for (const list of byFrom.values()) {
		list.sort((a, b) => a.id.localeCompare(b.id));
	}
	return byFrom;
}

/**
 * Plan the shortest deterministic transition path from the circuit's initial
 * state to its target state. Pure + deterministic.
 */
export function planExecutionPath(
	circuit: ExecutionCircuitSpec,
): ExecutionPlan {
	const stateIds = new Set(circuit.states.map((s) => s.id));
	const { initialState, targetState } = circuit;

	// A spec whose endpoints are undeclared cannot be planned; report unreachable
	// rather than throwing (validateExecutionCircuitSpec surfaces the real error).
	if (!stateIds.has(initialState) || !stateIds.has(targetState)) {
		return {
			reachable: false,
			atTarget: false,
			steps: [],
			statePath: [],
			reachableStates: [],
		};
	}

	const adjacency = buildAdjacency(circuit.transitions);

	// BFS from initialState, recording the transition used to reach each state.
	const visited = new Set<string>([initialState]);
	const arrivedBy = new Map<string, TransitionSpec>();
	const queue: string[] = [initialState];
	while (queue.length > 0) {
		const current = queue.shift() as string;
		for (const transition of adjacency.get(current) ?? []) {
			if (!stateIds.has(transition.to) || visited.has(transition.to)) {
				continue;
			}
			visited.add(transition.to);
			arrivedBy.set(transition.to, transition);
			queue.push(transition.to);
		}
	}

	const reachableStates = [...visited].sort((a, b) => a.localeCompare(b));

	if (initialState === targetState) {
		return {
			reachable: true,
			atTarget: true,
			steps: [],
			statePath: [initialState],
			reachableStates,
		};
	}

	if (!visited.has(targetState)) {
		return {
			reachable: false,
			atTarget: false,
			steps: [],
			statePath: [],
			reachableStates,
		};
	}

	// Reconstruct the path backwards from targetState via `arrivedBy`.
	const reversed: TransitionSpec[] = [];
	let cursor = targetState;
	while (cursor !== initialState) {
		const transition = arrivedBy.get(cursor);
		if (!transition) break; // unreachable (defensive — visited check covers this)
		reversed.push(transition);
		cursor = transition.from;
	}
	reversed.reverse();

	const steps: ExecutionPlanStep[] = reversed.map((transition) => ({
		transitionId: transition.id,
		from: transition.from,
		to: transition.to,
		label: transition.label,
	}));

	const statePath = [initialState, ...steps.map((step) => step.to)];

	return {
		reachable: true,
		atTarget: false,
		steps,
		statePath,
		reachableStates,
	};
}
