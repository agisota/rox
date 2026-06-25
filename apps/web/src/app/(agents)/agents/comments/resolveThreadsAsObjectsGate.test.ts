import { describe, expect, test } from "bun:test";

import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveThreadsAsObjectsGate } from "./resolveThreadsAsObjectsGate";

/**
 * `collaboration.threadsAsObjects` object-comments surface gate. The mount must
 * stay INERT until BOTH hold:
 *   1. there is an active organization to scope the org-wide comment thread,
 *   2. the experimental feature resolves usable (status `ready`, not killed).
 *
 * We do NOT invent a new flag — we reuse the existing experimental-features
 * registry (same pattern as `resolveCrmContactsGate`). The pure decision keeps
 * the React surface a thin shell. The feature's only provider dependency
 * (Liveblocks) is OPTIONAL, so it never gates this web surface.
 */
describe("resolveThreadsAsObjectsGate", () => {
	test("open when there is an active org and the feature is available", () => {
		const gate = resolveThreadsAsObjectsGate({ organizationId: "org_1" });
		expect(gate.enabled).toBe(true);
	});

	test("inert when there is no active organization to scope the thread", () => {
		const gate = resolveThreadsAsObjectsGate({ organizationId: undefined });
		expect(gate.enabled).toBe(false);
	});

	test("inert when the org id is an empty / whitespace string", () => {
		expect(resolveThreadsAsObjectsGate({ organizationId: "" }).enabled).toBe(
			false,
		);
		expect(resolveThreadsAsObjectsGate({ organizationId: "   " }).enabled).toBe(
			false,
		);
	});

	test("respects a platform kill switch on collaboration.threadsAsObjects", () => {
		const gate = resolveThreadsAsObjectsGate({
			organizationId: "org_1",
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
	});

	test("the underlying feature is registered ready (so the gate can open)", () => {
		// Anchors the flip: a planned status would resolve `not_implemented` and the
		// gate would stay closed regardless of org. With `ready` + an org the
		// availability is `available`.
		const state = resolveExperimentalFeatureState(
			"collaboration.threadsAsObjects",
			{ overrides: { "collaboration.threadsAsObjects": true } },
		);
		expect(state.availability).toBe("available");
	});

	test("Liveblocks is NOT a required provider for this feature (clean web flip)", () => {
		// The comment store is native Postgres on the Rox graph (synced via
		// Electric); Liveblocks is an OPTIONAL realtime accelerator. There must be no
		// required provider dependency that could force `needs_configuration` on web.
		const state = resolveExperimentalFeatureState(
			"collaboration.threadsAsObjects",
			{ overrides: { "collaboration.threadsAsObjects": true } },
		);
		const requiredProviders = state.dependencies.filter(
			(dependency) => dependency.kind === "provider" && dependency.required,
		);
		expect(requiredProviders).toHaveLength(0);
	});
});
