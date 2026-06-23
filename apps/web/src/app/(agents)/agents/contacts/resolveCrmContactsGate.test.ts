import { describe, expect, test } from "bun:test";

import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveCrmContactsGate } from "./resolveCrmContactsGate";

/**
 * `projectOs.crmContacts` CRM-contacts surface gate. The mount must stay INERT
 * until BOTH hold:
 *   1. there is an active organization to scope the org-wide `graph.listContacts`,
 *   2. the experimental feature resolves usable (status `ready`, not killed).
 *
 * We do NOT invent a new flag — we reuse the existing experimental-features
 * registry (same pattern as `resolveUnifiedSearchGate`). The pure decision keeps
 * the React surface a thin shell. The feature's only dependency
 * (`desktop-runtime`) is a `runtime` dep, so it never gates this web surface.
 */
describe("resolveCrmContactsGate", () => {
	test("open when there is an active org and the feature is available", () => {
		const gate = resolveCrmContactsGate({ organizationId: "org_1" });
		expect(gate.enabled).toBe(true);
	});

	test("inert when there is no active organization to scope the list", () => {
		const gate = resolveCrmContactsGate({ organizationId: undefined });
		expect(gate.enabled).toBe(false);
	});

	test("inert when the org id is an empty / whitespace string", () => {
		expect(resolveCrmContactsGate({ organizationId: "" }).enabled).toBe(false);
		expect(resolveCrmContactsGate({ organizationId: "   " }).enabled).toBe(
			false,
		);
	});

	test("respects a platform kill switch on projectOs.crmContacts", () => {
		const gate = resolveCrmContactsGate({
			organizationId: "org_1",
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
	});

	test("the underlying feature is registered ready (so the gate can open)", () => {
		// Anchors the flip: a planned status would resolve `not_implemented` and the
		// gate would stay closed regardless of org. With `ready` + an org the
		// availability is `available`.
		const state = resolveExperimentalFeatureState("projectOs.crmContacts", {
			overrides: { "projectOs.crmContacts": true },
		});
		expect(state.availability).toBe("available");
	});

	test("Huly is NOT a required provider for this feature (clean web flip)", () => {
		// The CRM contacts surface runs on the native Rox graph router; after the
		// demote there must be no required provider dependency that could force
		// `needs_configuration` on the web.
		const state = resolveExperimentalFeatureState("projectOs.crmContacts", {
			overrides: { "projectOs.crmContacts": true },
		});
		const requiredProviders = state.dependencies.filter(
			(dependency) => dependency.kind === "provider" && dependency.required,
		);
		expect(requiredProviders).toHaveLength(0);
	});
});
