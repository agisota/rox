import type { SyncBlockHandler } from "./conditionHandler";

/**
 * Build the `merge` block handler — a branch join. The executor already waits
 * for every live in-edge and shallow-merges their outputs into `ctx.input`
 * (`mergeInputs` in WorkflowExecutor), so a join only has to surface that
 * combined object on its single `out` handle. This makes the join point
 * explicit on the canvas (one node fed by N branches) and gives downstream
 * nodes a stable shape to read.
 *
 * Note: because only the *taken* branch's edge fires (condition/switch prune the
 * untaken path), a merge sitting after a condition receives exactly the live
 * branch's output — not a blend of both. After a `parallel`/fan-out every branch
 * is live, so `ctx.input` is the union of all of them (last-writer-wins on key
 * collisions, matching the executor's `Object.assign` merge).
 */
export function makeMergeHandler(): SyncBlockHandler {
	return (ctx) => ({
		handle: "out",
		output: { ...ctx.input },
	});
}
