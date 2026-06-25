import type { RoxWorkflowState } from "../types";

/**
 * Compute the set of blocks that can reach `target` by following edges
 * backwards, entering only through nodes that satisfy `allow`. This is the
 * mirror of {@link reachableFrom}: it answers "which upstream nodes feed
 * (directly or transitively) into `target`?" — the scope of nodes whose output
 * a node may reference via `{{node.field}}` (#550). `target` itself is excluded.
 */
export function ancestorsOf(
	state: RoxWorkflowState,
	target: string,
	allow: (id: string) => boolean = () => true,
): Set<string> {
	const visited = new Set<string>();
	if (!(target in state.blocks)) return visited;

	const reverse = new Map<string, string[]>();
	for (const id of Object.keys(state.blocks)) reverse.set(id, []);
	for (const edge of state.edges) {
		const sources = reverse.get(edge.target);
		if (sources) sources.push(edge.source);
	}

	const queue: string[] = [target];
	while (queue.length > 0) {
		const u = queue.shift();
		if (u === undefined) break;
		for (const v of reverse.get(u) ?? []) {
			if (visited.has(v) || v === target || !allow(v)) continue;
			visited.add(v);
			queue.push(v);
		}
	}
	return visited;
}
