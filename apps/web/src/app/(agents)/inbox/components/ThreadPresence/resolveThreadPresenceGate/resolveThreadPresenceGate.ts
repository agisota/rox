import { dashboardRoomId } from "@rox/collab/types";
import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Thread-scoped presence gate for the inbox.
 *
 * Mirrors the dashboard presence gate (WS-L T10): the presence layer stays
 * INERT until the existing `collaboration.presence` experimental feature
 * resolves available AND the LiveBlocks public key is configured. It reuses the
 * existing room-id convention (`org:{orgId}:dashboard:{id}`) with the thread id
 * as the room segment, so the server authorizes from the id alone with no new
 * flag and no schema change.
 */
export interface ThreadPresenceGateInput {
	/** `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` — the client-visible LiveBlocks key. */
	publicKey: string | undefined;
	/** Active organization id the room is scoped to. */
	organizationId: string | undefined;
	/** The active thread id the presence room binds to. */
	threadId: string | null;
	/** Platform kill switch for `collaboration.presence` (defaults off). */
	killSwitched?: boolean;
}

export interface ThreadPresenceGate {
	/** When false the mount renders nothing — fully inert. */
	enabled: boolean;
	/** Org/thread-scoped room id, or null when the gate is closed. */
	roomId: string | null;
}

export function resolveThreadPresenceGate({
	publicKey,
	organizationId,
	threadId,
	killSwitched = false,
}: ThreadPresenceGateInput): ThreadPresenceGate {
	const hasPublicKey = typeof publicKey === "string" && publicKey.trim() !== "";

	if (
		!hasPublicKey ||
		typeof organizationId !== "string" ||
		organizationId === "" ||
		typeof threadId !== "string" ||
		threadId === ""
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
		roomId: dashboardRoomId(organizationId, threadId),
	};
}
