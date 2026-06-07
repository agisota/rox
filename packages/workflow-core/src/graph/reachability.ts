import type { RoxWorkflowState } from "../types";

/**
 * Compute the set of blocks reachable from `start`, following edges only
 * through nodes that satisfy `allow`. A node failing `allow` is never entered,
 * so paths *through* it are cut — this is how disabled blocks break a chain.
 */
export function reachableFrom(
	state: RoxWorkflowState,
	start: string,
	allow: (id: string) => boolean,
): Set<string> {
	const visited = new Set<string>();
	if (!(start in state.blocks) || !allow(start)) return visited;

	const adjacency = new Map<string, string[]>();
	for (const id of Object.keys(state.blocks)) adjacency.set(id, []);
	for (const edge of state.edges) {
		const targets = adjacency.get(edge.source);
		if (targets) targets.push(edge.target);
	}

	visited.add(start);
	const queue: string[] = [start];
	while (queue.length > 0) {
		const u = queue.shift();
		if (u === undefined) break;
		for (const v of adjacency.get(u) ?? []) {
			if (visited.has(v) || !allow(v)) continue;
			visited.add(v);
			queue.push(v);
		}
	}
	return visited;
}
