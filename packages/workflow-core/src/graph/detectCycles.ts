import type { RoxWorkflowState } from "../types";

/**
 * Detect a cycle in the workflow's edge graph using a colored DFS.
 *
 * Returns the list of block ids forming the first cycle found (in order), or
 * `null` if the graph is acyclic. Neighbour traversal is sorted so the reported
 * cycle is deterministic.
 */
export function detectCycle(
	state: RoxWorkflowState,
	nodes?: Set<string>,
): string[] | null {
	const nodeSet = nodes ?? new Set(Object.keys(state.blocks));

	const adjacency = new Map<string, string[]>();
	for (const id of nodeSet) adjacency.set(id, []);
	for (const edge of state.edges) {
		if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
		const targets = adjacency.get(edge.source);
		if (targets) targets.push(edge.target);
	}

	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;
	const color = new Map<string, number>();
	for (const id of nodeSet) color.set(id, WHITE);

	const stack: string[] = [];
	let found: string[] | null = null;

	const visit = (u: string): boolean => {
		color.set(u, GRAY);
		stack.push(u);
		for (const v of [...(adjacency.get(u) ?? [])].sort()) {
			const c = color.get(v) ?? WHITE;
			if (c === GRAY) {
				const idx = stack.indexOf(v);
				found = idx >= 0 ? stack.slice(idx) : [v];
				return true;
			}
			if (c === WHITE && visit(v)) return true;
		}
		color.set(u, BLACK);
		stack.pop();
		return false;
	};

	for (const id of [...nodeSet].sort()) {
		if ((color.get(id) ?? WHITE) === WHITE && visit(id)) break;
	}

	return found;
}
