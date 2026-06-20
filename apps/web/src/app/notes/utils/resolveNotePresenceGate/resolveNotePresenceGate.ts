import { noteRoomId } from "@rox/collab/types";
import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Note-scoped collaboration gate for the markdown editor.
 *
 * Mirrors the inbox thread presence gate (WS-L T10): the live-editing layer
 * stays INERT until the existing `collaboration.presence` experimental feature
 * resolves available AND the LiveBlocks public key is configured. It uses the
 * org-scoped note room id (`org:{orgId}:note:{noteId}`) so the server authorizes
 * from the id alone with no new flag and no schema change.
 */
export interface NotePresenceGateInput {
	/** `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` — the client-visible LiveBlocks key. */
	publicKey: string | undefined;
	/** Active organization id the room is scoped to. */
	organizationId: string | undefined;
	/** The active note id the room binds to. */
	noteId: string | null;
	/** Platform kill switch for `collaboration.presence` (defaults off). */
	killSwitched?: boolean;
}

export interface NotePresenceGate {
	/** When false the editor stays single-player — no room mount. */
	enabled: boolean;
	/** Org/note-scoped room id, or null when the gate is closed. */
	roomId: string | null;
}

export function resolveNotePresenceGate({
	publicKey,
	organizationId,
	noteId,
	killSwitched = false,
}: NotePresenceGateInput): NotePresenceGate {
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

	const state = resolveExperimentalFeatureState("collaboration.presence", {
		dependencies: { liveblocks: "configured" },
		killSwitches: { "collaboration.presence": killSwitched },
		overrides: { "collaboration.presence": true },
	});

	const hardBlocked =
		state.availability === "blocked" ||
		state.availability === "needs_configuration";

	if (!state.enabled || hardBlocked) {
		return { enabled: false, roomId: null };
	}

	return {
		enabled: true,
		roomId: noteRoomId(organizationId, noteId),
	};
}
