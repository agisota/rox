import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the object-comments surface gate. The surface is the real,
 * web-reachable product surface for `collaboration.threadsAsObjects`: a durable
 * comment thread anchored to a Project-OS object (`graph.comments.list` /
 * `graph.comments.create`). Exactly like `resolveCrmContactsGate` for
 * `projectOs.crmContacts`, it REUSES the existing experimental feature instead of
 * inventing a new flag, and treats the active organization as the
 * provider-configured signal (the thread is org-scoped server-side —
 * `requireActiveOrgMembership` guards the router, so an org-less caller has
 * nothing to read).
 */
export interface ThreadsAsObjectsGateInput {
	/** Active organization id the thread is scoped to. */
	organizationId: string | undefined;
	/** Platform kill switch for `collaboration.threadsAsObjects` (defaults off). */
	killSwitched?: boolean;
}

export interface ThreadsAsObjectsGate {
	/** When false the surface renders an inert "unavailable" fallback. */
	enabled: boolean;
}

/**
 * Pure decision: may the object-comments surface mount?
 *
 * The surface stays inert until there is an active org AND the experimental
 * feature resolves usable. `collaboration.threadsAsObjects` declares an OPTIONAL
 * Liveblocks provider plus the `desktop-runtime` runtime dep — the resolver only
 * gates on REQUIRED *provider* deps, so neither blocks this web surface (the
 * comment store is native Postgres on the Rox graph, synced via Electric;
 * Liveblocks is an additive realtime accelerator, never a gate — see the feature
 * definition). With `implementationStatus: "ready"` the availability resolves
 * `available` for an org-scoped caller and the gate opens. A kill switch
 * (`blocked`) or a still-planned status (`not_implemented`) keeps it closed.
 */
export function resolveThreadsAsObjectsGate({
	organizationId,
	killSwitched = false,
}: ThreadsAsObjectsGateInput): ThreadsAsObjectsGate {
	const hasOrg =
		typeof organizationId === "string" && organizationId.trim() !== "";
	if (!hasOrg) {
		return { enabled: false };
	}

	const state = resolveExperimentalFeatureState(
		"collaboration.threadsAsObjects",
		{
			killSwitches: { "collaboration.threadsAsObjects": killSwitched },
			overrides: { "collaboration.threadsAsObjects": true },
		},
	);

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
