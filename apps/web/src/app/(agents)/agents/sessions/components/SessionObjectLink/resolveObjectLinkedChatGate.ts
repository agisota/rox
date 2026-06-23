import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";

/**
 * Inputs to the object-linked-chat surface gate. The surface is the real,
 * web-reachable product surface for `projectOs.objectLinkedChat`: a control on a
 * chat session's detail page that links the session (an `agent_session` graph
 * node, ensured on demand via `graph.create`) to a Project-OS object through
 * `graph.link` (relation `about` / `references`), and reads back the session's
 * existing links via `graph.neighbors`. Exactly like `resolveUnifiedSearchGate`
 * for `projectOs.unifiedSearch` and `resolvePresenceGate` for
 * `collaboration.presence`, it reuses the EXISTING experimental feature instead
 * of inventing a new flag, and treats the active organization as the
 * provider-configured signal (the `graph.*` router is org-membership gated via
 * `requireActiveOrgMembership`, so linking is meaningless without an org to
 * scope to).
 */
export interface ObjectLinkedChatGateInput {
	/** Active organization id the graph writes/reads are scoped to. */
	organizationId: string | undefined;
	/** The chat session the link control is bound to. */
	sessionId: string | undefined;
	/** Platform kill switch for `projectOs.objectLinkedChat` (defaults off). */
	killSwitched?: boolean;
}

export interface ObjectLinkedChatGate {
	/** When false the control renders an inert fallback and issues no graph calls. */
	enabled: boolean;
}

/**
 * Pure decision: may the object-linked-chat control mount?
 *
 * The control stays inert until there is an active org AND a concrete session id
 * AND the experimental feature resolves usable. `projectOs.objectLinkedChat`
 * declares only the `desktop-runtime` dependency, which is a `runtime`
 * dependency — the resolver only gates on required *provider* deps, so the
 * runtime dep never blocks this web surface (the same reason
 * `projectOs.workspaceShell` / `projectOs.unifiedSearch` open on the cloud graph
 * router with no external provider).
 *
 * Once `implementationStatus` is flipped to `ready`, availability resolves
 * `available` for an org-scoped caller and the gate opens. A kill switch
 * (`blocked`) or a still-stubbed status (`not_implemented`) keeps it closed.
 */
export function resolveObjectLinkedChatGate({
	organizationId,
	sessionId,
	killSwitched = false,
}: ObjectLinkedChatGateInput): ObjectLinkedChatGate {
	const hasOrg =
		typeof organizationId === "string" && organizationId.trim() !== "";
	const hasSession = typeof sessionId === "string" && sessionId.trim() !== "";
	if (!hasOrg || !hasSession) {
		return { enabled: false };
	}

	const state = resolveExperimentalFeatureState("projectOs.objectLinkedChat", {
		killSwitches: { "projectOs.objectLinkedChat": killSwitched },
		overrides: { "projectOs.objectLinkedChat": true },
	});

	const usable = state.enabled && state.availability === "available";
	return { enabled: usable };
}
