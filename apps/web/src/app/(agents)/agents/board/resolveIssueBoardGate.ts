import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the issue-board surface gate. The surface is the real, web-reachable
 * product surface for `projectOs.issueBoard`: a status-column board over the org's
 * REAL tasks (`task.statuses.list` columns × `task.list` cards), optionally scoped
 * to one `v2_project` via the shipped `graph.projectGraph` edge-walk. Exactly like
 * `resolveUnifiedSearchGate` for `projectOs.unifiedSearch`, it reuses the EXISTING
 * experimental feature instead of inventing a new flag, and treats the active
 * organization as the provider-configured signal (org-scoped task reads are
 * meaningless without an org to scope to — `requireActiveOrgMembership` guards the
 * task/graph routers).
 */
export interface IssueBoardGateInput {
	/** Active organization id the board is scoped to. */
	organizationId: string | undefined;
	/** Platform kill switch for `projectOs.issueBoard` (defaults off). */
	killSwitched?: boolean;
}

export interface IssueBoardGate {
	/** When false the surface renders a "configure org" fallback, fully inert. */
	enabled: boolean;
}

/**
 * Pure decision: may the issue-board surface mount?
 *
 * The surface stays inert until there is an active org AND the experimental
 * feature resolves usable. `projectOs.issueBoard` (after the Huly demote) declares
 * only the `desktop-runtime` dependency, which is a `runtime` dependency — the
 * resolver only gates on required *provider* deps, so the runtime dep never blocks
 * this web surface (the same reason `projectOs.unifiedSearch` /
 * `projectOs.workspaceShell` open on the web/cloud routers with no external
 * provider).
 *
 * Once `implementationStatus` is flipped to `ready`, availability resolves
 * `available` for an org-scoped caller and the gate opens. A kill switch
 * (`blocked`) or a still-planned status (`not_implemented`) keeps it closed.
 */
export function resolveIssueBoardGate({
	organizationId,
	killSwitched = false,
}: IssueBoardGateInput): IssueBoardGate {
	const hasOrg =
		typeof organizationId === "string" && organizationId.trim() !== "";
	if (!hasOrg) {
		return { enabled: false };
	}

	const state = resolveExperimentalFeatureState("projectOs.issueBoard", {
		killSwitches: { "projectOs.issueBoard": killSwitched },
		overrides: { "projectOs.issueBoard": true },
	});

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
