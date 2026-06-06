import type { SupersetWorkflowState } from "../types";

export interface TopologicalSortOptions {
	/** Restrict the sort to this set of block ids (e.g. enabled + reachable). */
	nodes?: Set<string>;
}

/**
 * Build a source -> [targets] adjacency map limited to the given node set.
 */
function buildAdjacency(
	state: SupersetWorkflowState,
	nodeSet: Set<string>,
): Map<string, string[]> {
	const adjacency = new Map<string, string[]>();
	for (const id of nodeSet) adjacency.set(id, []);
	for (const edge of state.edges) {
		if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
		const targets = adjacency.get(edge.source);
		if (targets) targets.push(edge.target);
	}
	return adjacency;
}

/**
 * Deterministic topological sort (Kahn's algorithm with a lexicographically
 * sorted ready set, so the order is stable across runs and platforms).
 *
 * Returns the execution order, or `null` if the selected nodes contain a cycle
 * (no total order exists).
 */
export function topologicalSort(
	state: SupersetWorkflowState,
	options: TopologicalSortOptions = {},
): string[] | null {
	const nodeSet = options.nodes ?? new Set(Object.keys(state.blocks));
	const adjacency = buildAdjacency(state, nodeSet);

	const inDegree = new Map<string, number>();
	for (const id of nodeSet) inDegree.set(id, 0);
	for (const targets of adjacency.values()) {
		for (const target of targets) {
			inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
		}
	}

	const ready: string[] = [...nodeSet]
		.filter((id) => (inDegree.get(id) ?? 0) === 0)
		.sort();

	const order: string[] = [];
	while (ready.length > 0) {
		const id = ready.shift();
		if (id === undefined) break;
		order.push(id);
		for (const target of [...(adjacency.get(id) ?? [])].sort()) {
			const next = (inDegree.get(target) ?? 0) - 1;
			inDegree.set(target, next);
			if (next === 0) ready.push(target);
		}
		ready.sort();
	}

	return order.length === nodeSet.size ? order : null;
}
