import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the template-marketplace surface gate. The surface is the
 * web-reachable parity of the desktop `templates.marketplace`: a browse view of
 * the real Rox project templates (`PROJECT_TEMPLATE_ENTRIES`). Like the other
 * web experimental gates it REUSES the existing experimental feature instead of
 * inventing a new flag.
 *
 * Unlike the graph-backed surfaces (search/contacts/comments) the catalog is
 * STATIC client data, so there is no org-scoped query to guard — the gate is the
 * experimental-feature state alone. The desktop marketplace routes into the
 * Template Gallery (a desktop-runtime project-creation engine) to apply a
 * template; the web has no desktop runtime in-session, so the web surface
 * browses the catalog and deep-links each template to its source instead of
 * faking a creation engine.
 */
export interface TemplateMarketplaceGateInput {
	/** Platform kill switch for `templates.marketplace` (defaults off). */
	killSwitched?: boolean;
}

export interface TemplateMarketplaceGate {
	/** When false the surface renders an inert "unavailable" fallback. */
	enabled: boolean;
}

/**
 * Pure decision: may the template-marketplace surface mount?
 *
 * `templates.marketplace` declares only the `desktop-runtime` dependency (a
 * `runtime` dep) — the resolver only gates on REQUIRED *provider* deps, so it
 * never blocks this web surface (the same clean web flip as
 * `projectOs.unifiedSearch`). With `implementationStatus: "ready"` the
 * availability resolves `available` and the gate opens. A kill switch
 * (`blocked`) or a still-planned status (`not_implemented`) keeps it closed.
 */
export function resolveTemplateMarketplaceGate({
	killSwitched = false,
}: TemplateMarketplaceGateInput = {}): TemplateMarketplaceGate {
	const state = resolveExperimentalFeatureState("templates.marketplace", {
		killSwitches: { "templates.marketplace": killSwitched },
		overrides: { "templates.marketplace": true },
	});

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
