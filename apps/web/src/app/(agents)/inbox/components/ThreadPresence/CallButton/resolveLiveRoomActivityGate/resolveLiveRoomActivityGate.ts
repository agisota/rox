import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Web gate for the Live Room Activity panel (the `live.transcript` shell).
 *
 * Mirrors `resolveThreadPresenceGate`: stays INERT until the existing
 * `live.transcript` experimental feature resolves available AND LiveKit is
 * configured (`NEXT_PUBLIC_LIVEKIT_URL`) AND an org/thread scope exists. Reuses
 * the proven `org:{orgId}:voice:{threadId}` room-name convention (the same one
 * `CallButton` mints a token for) — no new flag, no schema change.
 *
 * `live.transcript` depends on LiveKit ONLY, so once the flag is `ready` and the
 * SFU URL is set, the gate resolves enabled. Web media-join is still a stub, so
 * the panel renders its empty state until the web room actually opens.
 */
export interface LiveRoomActivityGateInput {
	/** `NEXT_PUBLIC_LIVEKIT_URL` — the client-visible SFU URL. */
	livekitUrl: string | undefined;
	/** Active organization id the room is scoped to. */
	organizationId: string | undefined;
	/** The active thread id (maps 1:1 to a voice channel id). */
	threadId: string | null;
	/** Platform kill switch for `live.transcript` (defaults off). */
	killSwitched?: boolean;
}

export interface LiveRoomActivityGate {
	/** When false the panel renders nothing — fully inert. */
	enabled: boolean;
	/** Org/thread-scoped voice room name, or null when the gate is closed. */
	roomName: string | null;
}

export function resolveLiveRoomActivityGate({
	livekitUrl,
	organizationId,
	threadId,
	killSwitched = false,
}: LiveRoomActivityGateInput): LiveRoomActivityGate {
	const hasLivekitUrl =
		typeof livekitUrl === "string" && livekitUrl.trim() !== "";

	if (
		!hasLivekitUrl ||
		typeof organizationId !== "string" ||
		organizationId === "" ||
		typeof threadId !== "string" ||
		threadId === ""
	) {
		return { enabled: false, roomName: null };
	}

	const state = resolveExperimentalFeatureState("live.transcript", {
		dependencies: { livekit: "configured" },
		killSwitches: { "live.transcript": killSwitched },
		overrides: { "live.transcript": true },
	});

	const hardBlocked =
		state.availability === "blocked" ||
		state.availability === "needs_configuration" ||
		state.availability === "not_implemented";

	if (!state.enabled || hardBlocked) {
		return { enabled: false, roomName: null };
	}

	return {
		enabled: true,
		roomName: `org:${organizationId}:voice:${threadId}`,
	};
}
