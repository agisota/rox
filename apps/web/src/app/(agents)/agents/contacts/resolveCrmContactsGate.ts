import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the CRM-contacts surface gate. The surface is the real,
 * web-reachable product surface for `projectOs.crmContacts`: an org-scoped list
 * of the contact objects (`graph.listContacts`) with a detail view of each
 * contact's linked objects (`graph.neighbors`). Exactly like
 * `resolveUnifiedSearchGate` for `projectOs.unifiedSearch`, it reuses the
 * EXISTING experimental feature instead of inventing a new flag, and treats the
 * active organization as the provider-configured signal (org-scoped contacts are
 * meaningless without an org to scope to — `requireActiveOrgMembership` guards
 * the router).
 */
export interface CrmContactsGateInput {
	/** Active organization id the contacts list is scoped to. */
	organizationId: string | undefined;
	/** Platform kill switch for `projectOs.crmContacts` (defaults off). */
	killSwitched?: boolean;
}

export interface CrmContactsGate {
	/** When false the surface renders a "configure org" fallback, fully inert. */
	enabled: boolean;
}

/**
 * Pure decision: may the CRM-contacts surface mount?
 *
 * The surface stays inert until there is an active org AND the experimental
 * feature resolves usable. `projectOs.crmContacts` declares only the
 * `desktop-runtime` dependency (a `runtime` dependency) after the Huly demote —
 * the resolver only gates on required *provider* deps, so the runtime dep never
 * blocks this web surface (the same reason `projectOs.unifiedSearch` /
 * `projectOs.objectLinkedChat` open on the web/cloud graph router with no
 * external provider).
 *
 * Once `implementationStatus` is flipped to `ready`, availability resolves
 * `available` for an org-scoped caller and the gate opens. A kill switch
 * (`blocked`) or a still-planned status (`not_implemented`) keeps it closed.
 */
export function resolveCrmContactsGate({
	organizationId,
	killSwitched = false,
}: CrmContactsGateInput): CrmContactsGate {
	const hasOrg =
		typeof organizationId === "string" && organizationId.trim() !== "";
	if (!hasOrg) {
		return { enabled: false };
	}

	const state = resolveExperimentalFeatureState("projectOs.crmContacts", {
		killSwitches: { "projectOs.crmContacts": killSwitched },
		overrides: { "projectOs.crmContacts": true },
	});

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
