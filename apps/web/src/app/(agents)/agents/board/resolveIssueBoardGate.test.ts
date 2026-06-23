import { describe, expect, test } from "bun:test";

import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveIssueBoardGate } from "./resolveIssueBoardGate";

/**
 * `projectOs.issueBoard` issue-board surface gate. The mount must stay INERT
 * until BOTH hold:
 *   1. there is an active organization to scope the org-wide task reads, and
 *   2. the experimental feature resolves usable (status `ready`, not killed).
 *
 * We do NOT invent a new flag — we reuse the existing experimental-features
 * registry (same pattern as `resolveUnifiedSearchGate`). The pure decision keeps
 * the React surface a thin shell. After the Huly demote the feature's only
 * dependency (`desktop-runtime`) is a `runtime` dep, so it never gates this web
 * surface.
 */
describe("resolveIssueBoardGate", () => {
	test("open when there is an active org and the feature is available", () => {
		const gate = resolveIssueBoardGate({ organizationId: "org_1" });
		expect(gate.enabled).toBe(true);
	});

	test("inert when there is no active organization to scope the board", () => {
		const gate = resolveIssueBoardGate({ organizationId: undefined });
		expect(gate.enabled).toBe(false);
	});

	test("inert when the org id is an empty / whitespace string", () => {
		expect(resolveIssueBoardGate({ organizationId: "" }).enabled).toBe(false);
		expect(resolveIssueBoardGate({ organizationId: "   " }).enabled).toBe(
			false,
		);
	});

	test("respects a platform kill switch on projectOs.issueBoard", () => {
		const gate = resolveIssueBoardGate({
			organizationId: "org_1",
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
	});

	test("the underlying feature is registered ready with NO required provider", () => {
		// Anchors the flip + the Huly demote: a planned status would resolve
		// `not_implemented`, and a required Huly provider would resolve
		// `needs_configuration` — either keeps the gate closed regardless of org.
		// With `ready` + only the (runtime) desktop dep, an org-scoped caller
		// resolves `available`.
		const state = resolveExperimentalFeatureState("projectOs.issueBoard", {
			overrides: { "projectOs.issueBoard": true },
		});
		expect(state.availability).toBe("available");
		// No required PROVIDER dependency survives the demote (runtime deps are fine).
		const requiredProviders = state.dependencies.filter(
			(dep) => dep.kind === "provider" && dep.required,
		);
		expect(requiredProviders).toEqual([]);
	});
});
