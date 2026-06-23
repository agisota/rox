import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the connect-a-source surface gate. The surface is the real,
 * web-reachable product surface for `agentNative.sourceMarketplace`
 * (create/list/setStatus against the org-scoped tRPC CRUD), so — exactly like
 * `resolvePresenceGate` for `collaboration.presence` — it reuses the EXISTING
 * experimental feature rather than inventing a new flag, and treats the active
 * organization as the "agent-native provider configured" signal (the CRUD is
 * meaningless without an org to scope to).
 */
export interface SourcesGateInput {
	/** Active organization id the sources are scoped to. */
	organizationId: string | undefined;
	/** Platform kill switch for `agentNative.sourceMarketplace` (defaults off). */
	killSwitched?: boolean;
}

export interface SourcesGate {
	/** When false the surface renders a "configure org" fallback, fully inert. */
	enabled: boolean;
}

/**
 * Pure decision: may the connect-a-source surface mount?
 *
 * The surface stays inert until there is an active org AND the experimental
 * feature resolves usable. `agentNative.sourceMarketplace` declares the
 * `agent-native` provider as required; the active org IS that provider's
 * configured signal here, so we feed it into `resolveExperimentalFeatureState`
 * rather than declaring a parallel flag. (Its other dependency,
 * `desktop-runtime`, is a `runtime` dependency — the resolver only gates on
 * required *provider* deps, so it never blocks this web surface.)
 *
 * Once `implementationStatus` is flipped to `ready`, availability resolves
 * `available` for an org-scoped caller and the gate opens. A kill switch
 * (`blocked`) or a still-stubbed status (`not_implemented`) keeps it closed.
 */
export function resolveSourcesGate({
	organizationId,
	killSwitched = false,
}: SourcesGateInput): SourcesGate {
	const hasOrg =
		typeof organizationId === "string" && organizationId.trim() !== "";
	if (!hasOrg) {
		return { enabled: false };
	}

	const state = resolveExperimentalFeatureState(
		"agentNative.sourceMarketplace",
		{
			dependencies: { "agent-native": "configured" },
			killSwitches: { "agentNative.sourceMarketplace": killSwitched },
			overrides: { "agentNative.sourceMarketplace": true },
		},
	);

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
