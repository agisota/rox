import { dashboardRoomId } from "@rox/collab/types";
import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the WS-L T10 presence gate. All come from runtime context the web
 * shell already has — the LiveBlocks public key (env), the active org, and the
 * dashboard/workspace id — so the gate adds NO new flag of its own (per D3, it
 * reuses the existing `collaboration.presence` experimental feature + the
 * existing `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`).
 */
export interface PresenceGateInput {
	/** `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` — the client-visible LiveBlocks key. */
	publicKey: string | undefined;
	/** Active organization id the room is scoped to. */
	organizationId: string | undefined;
	/** Dashboard/workspace id the presence room is bound to. */
	dashboardId: string;
	/** Platform kill switch for `collaboration.presence` (defaults off). */
	killSwitched?: boolean;
}

export interface PresenceGate {
	/** When false the mount renders nothing — the feature stays fully inert. */
	enabled: boolean;
	/** Org/project-scoped room id, or null when the gate is closed. */
	roomId: string | null;
}

/**
 * Pure decision: is the collaborative-presence surface allowed to mount?
 *
 * The presence layer stays INERT until BOTH the existing experimental feature
 * resolves available AND the LiveBlocks public key is configured. Presence is
 * configured ⇔ the public key is set, so we feed that into the existing
 * `resolveExperimentalFeatureState` as the provider-configured signal rather
 * than inventing a parallel flag.
 */
export function resolvePresenceGate({
	publicKey,
	organizationId,
	dashboardId,
	killSwitched = false,
}: PresenceGateInput): PresenceGate {
	const hasPublicKey = typeof publicKey === "string" && publicKey.trim() !== "";
	const hasScope =
		typeof organizationId === "string" &&
		organizationId !== "" &&
		dashboardId !== "";

	if (!hasPublicKey || !hasScope) {
		return { enabled: false, roomId: null };
	}

	const state = resolveExperimentalFeatureState("collaboration.presence", {
		// the public key being set IS the "liveblocks provider configured" signal
		dependencies: { liveblocks: "configured" },
		killSwitches: { "collaboration.presence": killSwitched },
		// T10 opts the surface in once keys exist; per-user Settings > Experiments
		// can still flip it off via an override later.
		overrides: { "collaboration.presence": true },
	});

	// `collaboration.presence` is registered as `implementationStatus: "planned"`
	// (its durable WS-J surface is separate), so the resolver reports
	// `not_implemented` — that is expected and NON-blocking here: this very mount
	// is the implementation. Only a kill switch (`blocked`) or a missing provider
	// (`needs_configuration`) genuinely closes the gate.
	const hardBlocked =
		state.availability === "blocked" ||
		state.availability === "needs_configuration";

	if (!state.enabled || hardBlocked) {
		return { enabled: false, roomId: null };
	}

	return {
		enabled: true,
		roomId: dashboardRoomId(organizationId, dashboardId),
	};
}
