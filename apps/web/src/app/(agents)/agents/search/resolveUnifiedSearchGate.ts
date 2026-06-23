import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the unified-search surface gate. The surface is the real,
 * web-reachable product surface for `projectOs.unifiedSearch`: a debounced query
 * over the org's object graph (`graph.search`, kinds-filtered) that renders the
 * hits and deep-links each to its object. Exactly like `resolveSourcesGate` for
 * `agentNative.sourceMarketplace` and `resolvePresenceGate` for
 * `collaboration.presence`, it reuses the EXISTING experimental feature instead
 * of inventing a new flag, and treats the active organization as the
 * provider-configured signal (org-scoped search is meaningless without an org to
 * scope to — `requireActiveOrgMembership` guards the router).
 */
export interface UnifiedSearchGateInput {
	/** Active organization id the search is scoped to. */
	organizationId: string | undefined;
	/** Platform kill switch for `projectOs.unifiedSearch` (defaults off). */
	killSwitched?: boolean;
}

export interface UnifiedSearchGate {
	/** When false the surface renders a "configure org" fallback, fully inert. */
	enabled: boolean;
}

/**
 * Pure decision: may the unified-search surface mount?
 *
 * The surface stays inert until there is an active org AND the experimental
 * feature resolves usable. `projectOs.unifiedSearch` declares only the
 * `desktop-runtime` dependency, which is a `runtime` dependency — the resolver
 * only gates on required *provider* deps, so the runtime dep never blocks this
 * web surface (the same reason `projectOs.workspaceShell` opens on the web/cloud
 * graph router with no external provider).
 *
 * Once `implementationStatus` is flipped to `ready`, availability resolves
 * `available` for an org-scoped caller and the gate opens. A kill switch
 * (`blocked`) or a still-stubbed status (`not_implemented`) keeps it closed.
 */
export function resolveUnifiedSearchGate({
	organizationId,
	killSwitched = false,
}: UnifiedSearchGateInput): UnifiedSearchGate {
	const hasOrg =
		typeof organizationId === "string" && organizationId.trim() !== "";
	if (!hasOrg) {
		return { enabled: false };
	}

	const state = resolveExperimentalFeatureState("projectOs.unifiedSearch", {
		killSwitches: { "projectOs.unifiedSearch": killSwitched },
		overrides: { "projectOs.unifiedSearch": true },
	});

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
