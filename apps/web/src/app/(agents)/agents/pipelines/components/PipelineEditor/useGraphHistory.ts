"use client";

/**
 * Undo/redo snapshot stack for the pipeline editor's authoritative
 * `RoxWorkflowState`.
 *
 * Strategy: the editor pushes the *previous* graph onto the past stack right
 * before every committed edit (`applyGraphChange`). Undo pops the past onto the
 * future and replays the snapshot through the SAME `applyGraphChange` save loop
 * (never bypassing `pendingSave`/`saveInFlight`), so persistence stays correct.
 * Redo is the mirror. The stack is capped to avoid unbounded memory on long
 * sessions.
 *
 * Snapshots are by-reference: every editor mutation already produces a fresh
 * immutable `RoxWorkflowState`, so holding the old reference is a valid snapshot
 * without cloning.
 */

import type { RoxWorkflowState } from "@rox/workflow-core";
import { useCallback, useRef, useState } from "react";

const HISTORY_CAP = 50;

export type GraphHistory = {
	/** Record `prev` as an undo checkpoint (call before committing an edit). */
	record: (prev: RoxWorkflowState) => void;
	/** Step back one edit, replaying the prior snapshot. No-op when empty. */
	undo: () => void;
	/** Re-apply the last undone edit. No-op when empty. */
	redo: () => void;
	/** Clear both stacks (e.g. when the edited pipeline identity changes). */
	reset: () => void;
	canUndo: boolean;
	canRedo: boolean;
};

/**
 * @param currentRef Ref to the live graph (read at undo/redo time so we can move
 *   the *current* state onto the opposite stack).
 * @param replay Applies a snapshot through the editor's save loop.
 */
export function useGraphHistory(
	currentRef: React.MutableRefObject<RoxWorkflowState>,
	replay: (state: RoxWorkflowState) => void,
): GraphHistory {
	const past = useRef<RoxWorkflowState[]>([]);
	const future = useRef<RoxWorkflowState[]>([]);
	// Mirror stack depth into render state so the toolbar buttons enable/disable.
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	const sync = useCallback(() => {
		setCanUndo(past.current.length > 0);
		setCanRedo(future.current.length > 0);
	}, []);

	const record = useCallback(
		(prev: RoxWorkflowState) => {
			past.current.push(prev);
			if (past.current.length > HISTORY_CAP) past.current.shift();
			// A fresh user edit invalidates the redo timeline.
			future.current = [];
			sync();
		},
		[sync],
	);

	const undo = useCallback(() => {
		const prev = past.current.pop();
		if (prev === undefined) return;
		future.current.push(currentRef.current);
		if (future.current.length > HISTORY_CAP) future.current.shift();
		sync();
		replay(prev);
	}, [currentRef, replay, sync]);

	const redo = useCallback(() => {
		const next = future.current.pop();
		if (next === undefined) return;
		past.current.push(currentRef.current);
		if (past.current.length > HISTORY_CAP) past.current.shift();
		sync();
		replay(next);
	}, [currentRef, replay, sync]);

	const reset = useCallback(() => {
		past.current = [];
		future.current = [];
		sync();
	}, [sync]);

	return { record, undo, redo, reset, canUndo, canRedo };
}
