import { describe, expect, test } from "bun:test";

import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveUnifiedSearchGate } from "./resolveUnifiedSearchGate";

/**
 * `projectOs.unifiedSearch` unified-search surface gate. The mount must stay
 * INERT until BOTH hold:
 *   1. there is an active organization to scope the org-wide `graph.search`, and
 *   2. the experimental feature resolves usable (status `ready`, not killed).
 *
 * We do NOT invent a new flag — we reuse the existing experimental-features
 * registry (same pattern as `resolveSourcesGate` / `resolvePresenceGate`). The
 * pure decision keeps the React surface a thin shell. The feature's only
 * dependency (`desktop-runtime`) is a `runtime` dep, so it never gates this web
 * surface.
 */
describe("resolveUnifiedSearchGate", () => {
	test("open when there is an active org and the feature is available", () => {
		const gate = resolveUnifiedSearchGate({ organizationId: "org_1" });
		expect(gate.enabled).toBe(true);
	});

	test("inert when there is no active organization to scope the search", () => {
		const gate = resolveUnifiedSearchGate({ organizationId: undefined });
		expect(gate.enabled).toBe(false);
	});

	test("inert when the org id is an empty / whitespace string", () => {
		expect(resolveUnifiedSearchGate({ organizationId: "" }).enabled).toBe(
			false,
		);
		expect(resolveUnifiedSearchGate({ organizationId: "   " }).enabled).toBe(
			false,
		);
	});

	test("respects a platform kill switch on projectOs.unifiedSearch", () => {
		const gate = resolveUnifiedSearchGate({
			organizationId: "org_1",
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
	});

	test("the underlying feature is registered ready (so the gate can open)", () => {
		// Anchors the flip: a stubbed/planned status would resolve `not_implemented`
		// and the gate would stay closed regardless of org. With `ready` + an org
		// the availability is `available`.
		const state = resolveExperimentalFeatureState("projectOs.unifiedSearch", {
			overrides: { "projectOs.unifiedSearch": true },
		});
		expect(state.availability).toBe("available");
	});
});
