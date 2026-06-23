import { describe, expect, it } from "bun:test";
import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveSourcesGate } from "./resolveSourcesGate";

const ORG_ID = "22222222-2222-4222-8222-222222222222";

describe("resolveSourcesGate", () => {
	it("stays closed without an active organization", () => {
		expect(resolveSourcesGate({ organizationId: undefined }).enabled).toBe(
			false,
		);
		expect(resolveSourcesGate({ organizationId: "  " }).enabled).toBe(false);
	});

	it("opens for an org-scoped caller now that the feature is ready", () => {
		expect(resolveSourcesGate({ organizationId: ORG_ID }).enabled).toBe(true);
	});

	it("stays closed when the platform kill switch is set", () => {
		expect(
			resolveSourcesGate({ organizationId: ORG_ID, killSwitched: true })
				.enabled,
		).toBe(false);
	});

	it("relies on the registered feature being ready (guards an accidental demote)", () => {
		// The surface is only legitimately gate-open because the feature is `ready`.
		// If a future change demotes it back to stubbed/planned, the resolver would
		// report `not_implemented` and this gate must close — assert the precondition
		// so the demote is caught here rather than silently shipping a dead surface.
		const state = resolveExperimentalFeatureState(
			"agentNative.sourceMarketplace",
			{ dependencies: { "agent-native": "configured" } },
		);
		expect(state.availability).toBe("available");
	});
});
