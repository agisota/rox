/**
 * `@rox/collab/yjs` — the Yjs CRDT binding core for collaborative note editing.
 *
 * This module is the LIGHTEST correct binding between a plain controlled
 * `<textarea>` (the note editor primitive in `apps/web` — see
 * `NoteEditor.tsx`, a `@rox/ui/textarea` bound to a `markdown` string) and a
 * shared `Y.Text`. It deliberately holds NO React and NO Liveblocks imports so
 * the convergence + diff logic can be unit-tested against bare `Y.Doc`s with no
 * live server. The React/Liveblocks wiring lives in `apps/web`
 * (`CollaborativeNoteText`) and only consumes these pure helpers.
 *
 * Why a hand-written `Y.Text`↔string binding (not `y-prosemirror` /
 * `@lexical/yjs` / `y-codemirror.next`): the editor is a plain textarea, so the
 * correct minimal binding is a single-splice text diff applied to `Y.Text`,
 * mirrored back through `Y.Text.observe`. No editor framework is introduced.
 */

import type { Transaction, Text as YText } from "yjs";

/** The shared `Y.Text` key inside a note's Yjs document. */
export const NOTE_TEXT_KEY = "note-markdown";

/**
 * A minimal single-region text edit: delete `deleteCount` chars at `index`,
 * then insert `insert`. Computed by diffing the previous and next string with a
 * common-prefix / common-suffix scan — the exact shape a user's keystroke,
 * paste, or selection-replace produces in a textarea, so it maps to the
 * smallest possible `Y.Text` mutation (and therefore the smallest CRDT update).
 */
export interface TextSplice {
	/** Offset where the changed region starts. */
	index: number;
	/** Number of characters removed at `index`. */
	deleteCount: number;
	/** Text inserted at `index` after the deletion. */
	insert: string;
}

/**
 * Diff `prev` → `next` as a single contiguous splice.
 *
 * Strips the shared leading prefix and trailing suffix, leaving the one region
 * that actually changed. For a no-op (`prev === next`) it returns a zero-width,
 * zero-length splice so callers can cheaply skip applying it. This is correct
 * for the common textarea edits (type, delete, paste, replace-selection); it is
 * intentionally not a minimal multi-region diff, because a CRDT only needs a
 * faithful local→shared delta, not an optimal one.
 */
export function computeTextSplice(prev: string, next: string): TextSplice {
	if (prev === next) {
		return { index: 0, deleteCount: 0, insert: "" };
	}

	const prevLen = prev.length;
	const nextLen = next.length;
	const maxPrefix = Math.min(prevLen, nextLen);

	let prefix = 0;
	while (prefix < maxPrefix && prev[prefix] === next[prefix]) {
		prefix++;
	}

	// Longest common suffix that does not overlap the shared prefix on either
	// side (so a single char flanked by identical text is still captured once).
	let suffix = 0;
	const maxSuffix = Math.min(prevLen - prefix, nextLen - prefix);
	while (
		suffix < maxSuffix &&
		prev[prevLen - 1 - suffix] === next[nextLen - 1 - suffix]
	) {
		suffix++;
	}

	return {
		index: prefix,
		deleteCount: prevLen - prefix - suffix,
		insert: next.slice(prefix, nextLen - suffix),
	};
}

/**
 * Apply the minimal splice that turns the current `Y.Text` content into `next`.
 *
 * Runs the delete+insert inside a single Yjs transaction tagged with `origin`
 * so the observer that mirrors remote edits back into local state can ignore
 * echoes of its own writes (`transaction.origin === origin`). Returns `true`
 * when a mutation was applied, `false` for a no-op — letting the caller avoid
 * needless transactions on unchanged input.
 */
export function syncStringToYText(
	yText: YText,
	next: string,
	origin?: unknown,
): boolean {
	const current = yText.toString();
	const splice = computeTextSplice(current, next);
	if (splice.deleteCount === 0 && splice.insert === "") {
		return false;
	}

	const doc = yText.doc;
	const run = () => {
		if (splice.deleteCount > 0) {
			yText.delete(splice.index, splice.deleteCount);
		}
		if (splice.insert.length > 0) {
			yText.insert(splice.index, splice.insert);
		}
	};

	if (doc) {
		doc.transact(run, origin);
	} else {
		run();
	}
	return true;
}

/** Read the plain-string content of a `Y.Text`. */
export function yTextToString(yText: YText): string {
	return yText.toString();
}

/**
 * True when a `Y.Text` change transaction was caused by our own local write
 * (its `origin` matches the binding's `origin`). The textarea binding uses this
 * to skip re-applying its own edit back onto itself — only genuinely remote
 * transactions update local React state.
 */
export function isLocalOrigin(
	transaction: Transaction,
	origin: unknown,
): boolean {
	return transaction.origin === origin;
}
