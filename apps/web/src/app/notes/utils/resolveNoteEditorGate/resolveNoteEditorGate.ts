import { noteRoomId } from "@rox/collab/types";
import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Note-scoped collaboration gate for REAL-TIME CO-EDITING of the markdown body.
 *
 * Mirrors {@link resolveNotePresenceGate} (which gates live cursors on the same
 * surface) but resolves the `collaboration.editor` experimental feature instead
 * of `collaboration.presence`. Both reuse the EXISTING `org:{orgId}:note:{noteId}`
 * room id (`noteRoomId`) and the SAME `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`, so the
 * co-editing layer binds a `Y.Doc` to the very room presence already opens — no
 * second provider, no new flag, no schema change.
 *
 * When this gate is CLOSED the editor stays exactly single-player (the textarea
 * autosaves through `notebooks.updateNote` as today). When OPEN, the textarea is
 * additionally bound to a shared `Y.Text` over Liveblocks Yjs.
 */
export interface NoteEditorGateInput {
	/** `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` — the client-visible Liveblocks key. */
	publicKey: string | undefined;
	/** Active organization id the room is scoped to. */
	organizationId: string | undefined;
	/** The active note id the room binds to. */
	noteId: string | null;
	/** Platform kill switch for `collaboration.editor` (defaults off). */
	killSwitched?: boolean;
}

export interface NoteEditorGate {
	/** When false the editor stays single-player — no Yjs room mount. */
	enabled: boolean;
	/** Org/note-scoped room id, or null when the gate is closed. */
	roomId: string | null;
}

export function resolveNoteEditorGate({
	publicKey,
	organizationId,
	noteId,
	killSwitched = false,
}: NoteEditorGateInput): NoteEditorGate {
	const hasPublicKey = typeof publicKey === "string" && publicKey.trim() !== "";

	if (
		!hasPublicKey ||
		typeof organizationId !== "string" ||
		organizationId === "" ||
		typeof noteId !== "string" ||
		noteId === ""
	) {
		return { enabled: false, roomId: null };
	}

	const state = resolveExperimentalFeatureState("collaboration.editor", {
		// The public key being set IS the "Liveblocks provider configured" signal —
		// the same signal the presence gate feeds, because co-editing rides the
		// identical room/token path (the note-room ACL already grants editors
		// storage-write via `collab.authRoom`, which is what Yjs needs).
		dependencies: { liveblocks: "configured" },
		killSwitches: { "collaboration.editor": killSwitched },
		// Opt the surface in once keys exist; a per-user Settings > Experiments
		// override can still flip it off later.
		overrides: { "collaboration.editor": true },
	});

	// Only a kill switch (`blocked`) or a genuinely missing provider
	// (`needs_configuration`) closes the gate. `not_implemented` would never
	// reach here once the feature is flipped to `ready`, but we treat it as a
	// hard block too so a future demote safely reverts to single-player.
	const hardBlocked =
		state.availability === "blocked" ||
		state.availability === "needs_configuration" ||
		state.availability === "not_implemented";

	if (!state.enabled || hardBlocked) {
		return { enabled: false, roomId: null };
	}

	return {
		enabled: true,
		roomId: noteRoomId(organizationId, noteId),
	};
}
