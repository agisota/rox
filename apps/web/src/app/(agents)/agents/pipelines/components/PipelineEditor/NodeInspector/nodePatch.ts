/**
 * Pure builders that fold a single node edit into a fresh `RoxWorkflowState`.
 *
 * The inspector never mutates the canvas-derived xyflow nodes; instead it patches
 * the authoritative graph (`graphRef.current`) through these pure functions and
 * routes the result through the existing `applyGraphChange` debounced save loop.
 * Keeping the logic pure (no React, no tRPC) mirrors `graph-adapter.ts` and makes
 * the rename/clamp/merge rules unit-testable without a DOM.
 */

import {
	MAX_LOOP_ITERATIONS,
	type RoxBlockState,
	type RoxWorkflowState,
} from "@rox/workflow-core";

/** A single node-field patch. Absent keys are left untouched. */
export type NodePatch = {
	/** Rename. Trimmed; empty/whitespace is rejected (reverts to prior name). */
	name?: string;
	/** Toggle the block's enabled flag. */
	enabled?: boolean;
	/** Shallow-merge these keys into the block's subBlocks. */
	subBlocksPatch?: Record<string, unknown>;
	/** Remove these keys from the block's subBlocks (after the merge). */
	deleteSubBlockKeys?: string[];
};

/** Lower bound for a node `name` (mirrors createPipelineSchema: 1..120 trimmed). */
export const NAME_MAX = 120;
/**
 * Loop iteration clamp. The upper bound is the runtime's hard loop-replay cap
 * (`MAX_LOOP_ITERATIONS` from `@rox/workflow-core`, #527) — previously this clamped
 * to 200 while the executor capped replays at 20, so a user entering e.g. 100 was
 * silently capped at run time. Mirroring the runtime cap here means the value the
 * user can enter is the value the runtime will honour.
 */
export const MAX_ITERATIONS_MIN = 1;
export const MAX_ITERATIONS_MAX = MAX_LOOP_ITERATIONS;

/**
 * Normalize a candidate node name. Returns the trimmed value when it is a
 * non-empty string within bounds, otherwise `null` (caller should revert to the
 * prior name — never fall through to the block id, which would be confusing).
 */
export function sanitizeName(raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	if (trimmed.length > NAME_MAX) return trimmed.slice(0, NAME_MAX);
	return trimmed;
}

/**
 * Clamp/validate a loop `maxIterations` input. Returns an integer within
 * [{@link MAX_ITERATIONS_MIN}, {@link MAX_ITERATIONS_MAX}] (the runtime's loop cap),
 * or `null` when the input is blank / non-numeric (caller deletes the key so the
 * node falls back to its default label).
 */
export function clampMaxIterations(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) return null;
	const int = Math.round(parsed);
	if (int < MAX_ITERATIONS_MIN) return MAX_ITERATIONS_MIN;
	if (int > MAX_ITERATIONS_MAX) return MAX_ITERATIONS_MAX;
	return int;
}

/** Whether the given block is the (sole) pipeline start block. */
export function isStartBlock(block: RoxBlockState | undefined): boolean {
	return block?.type === "start";
}

/** Count the enabled/total start blocks in a graph. */
export function countStartBlocks(state: RoxWorkflowState): number {
	return Object.values(state.blocks).filter((b) => b.type === "start").length;
}

/**
 * Build the next `RoxWorkflowState` for a single-block patch. Returns the SAME
 * reference when the patch is a no-op (e.g. an empty rename) or the block is
 * missing, so callers can skip a redundant save.
 */
export function buildNodePatch(
	state: RoxWorkflowState,
	blockId: string,
	patch: NodePatch,
): RoxWorkflowState {
	const prevBlock = state.blocks[blockId];
	if (!prevBlock) return state;

	const nextBlock: RoxBlockState = { ...prevBlock };
	let changed = false;

	if (patch.name !== undefined) {
		const name = sanitizeName(patch.name);
		// Empty/whitespace rename is a no-op (revert handled by the caller's UI).
		if (name !== null && name !== prevBlock.name) {
			nextBlock.name = name;
			changed = true;
		}
	}

	if (patch.enabled !== undefined && patch.enabled !== prevBlock.enabled) {
		nextBlock.enabled = patch.enabled;
		changed = true;
	}

	if (
		(patch.subBlocksPatch && Object.keys(patch.subBlocksPatch).length > 0) ||
		(patch.deleteSubBlockKeys && patch.deleteSubBlockKeys.length > 0)
	) {
		const nextSub: Record<string, unknown> = { ...(prevBlock.subBlocks ?? {}) };
		if (patch.subBlocksPatch) {
			for (const [key, value] of Object.entries(patch.subBlocksPatch)) {
				nextSub[key] = value;
			}
		}
		if (patch.deleteSubBlockKeys) {
			for (const key of patch.deleteSubBlockKeys) {
				delete nextSub[key];
			}
		}
		nextBlock.subBlocks = Object.keys(nextSub).length > 0 ? nextSub : undefined;
		changed = true;
	}

	if (!changed) return state;

	return {
		...state,
		blocks: { ...state.blocks, [blockId]: nextBlock },
	};
}

/** Result of attempting a node delete. */
export type DeleteNodeResult =
	| { ok: true; state: RoxWorkflowState }
	| { ok: false; reason: "missing" | "start_protected" };

/**
 * Build the next graph with `blockId` removed, also pruning any edges touching
 * it. Refuses to delete the sole `start` block (deleting it would flip the graph
 * to MISSING_START_BLOCK).
 */
export function buildNodeDelete(
	state: RoxWorkflowState,
	blockId: string,
): DeleteNodeResult {
	const block = state.blocks[blockId];
	if (!block) return { ok: false, reason: "missing" };
	if (isStartBlock(block)) return { ok: false, reason: "start_protected" };

	const nextBlocks: Record<string, RoxBlockState> = {};
	for (const [id, b] of Object.entries(state.blocks)) {
		if (id !== blockId) nextBlocks[id] = b;
	}

	const nextEdges = state.edges.filter(
		(edge) => edge.source !== blockId && edge.target !== blockId,
	);

	// Drop the deleted node from any loop/parallel membership lists.
	const nextLoops: RoxWorkflowState["loops"] = {};
	for (const [loopId, loop] of Object.entries(state.loops)) {
		nextLoops[loopId] = {
			...loop,
			nodes: loop.nodes.filter((id) => id !== blockId),
		};
	}
	const nextParallels: RoxWorkflowState["parallels"] = {};
	for (const [parId, par] of Object.entries(state.parallels)) {
		nextParallels[parId] = {
			...par,
			nodes: par.nodes.filter((id) => id !== blockId),
		};
	}

	return {
		ok: true,
		state: {
			...state,
			blocks: nextBlocks,
			edges: nextEdges,
			loops: nextLoops,
			parallels: nextParallels,
		},
	};
}
