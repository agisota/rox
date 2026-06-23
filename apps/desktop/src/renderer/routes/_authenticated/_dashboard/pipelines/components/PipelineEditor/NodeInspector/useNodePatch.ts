import type { RoxWorkflowState } from "@rox/workflow-core";
import type { MutableRefObject } from "react";
import { useCallback, useMemo } from "react";
import {
	buildNodeDelete,
	buildNodePatch,
	type DeleteNodeResult,
	type NodePatch,
} from "./nodePatch";

/**
 * Bridges the pure node-patch builders to the editor's single debounced save
 * loop. Reads from `graphRef.current` (the authoritative working graph, kept in
 * sync with the canvas) so a concurrent drag re-serialization is never clobbered,
 * then routes every edit through the existing `applyGraphChange`.
 *
 * Returns stable callbacks. No second debounce / mutation is introduced — these
 * fold into the same queue the canvas uses.
 */
export function useNodePatch(
	graphRef: MutableRefObject<RoxWorkflowState>,
	applyGraphChange: (next: RoxWorkflowState) => void,
) {
	const patchNode = useCallback(
		(blockId: string, patch: NodePatch) => {
			const next = buildNodePatch(graphRef.current, blockId, patch);
			// buildNodePatch returns the same reference on a no-op; skip the save.
			if (next === graphRef.current) return;
			applyGraphChange(next);
		},
		[graphRef, applyGraphChange],
	);

	const renameNode = useCallback(
		(blockId: string, name: string) => patchNode(blockId, { name }),
		[patchNode],
	);

	const deleteNode = useCallback(
		(blockId: string): DeleteNodeResult => {
			const result = buildNodeDelete(graphRef.current, blockId);
			if (result.ok) applyGraphChange(result.state);
			return result;
		},
		[graphRef, applyGraphChange],
	);

	return useMemo(
		() => ({ patchNode, renameNode, deleteNode }),
		[patchNode, renameNode, deleteNode],
	);
}

export type NodePatchApi = ReturnType<typeof useNodePatch>;
