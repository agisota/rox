import { describe, expect, test } from "bun:test";

import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveTemplateMarketplaceGate } from "./resolveTemplateMarketplaceGate";

/**
 * `templates.marketplace` template-marketplace surface gate. The surface browses
 * a STATIC catalog (no org-scoped query), so the only condition is that the
 * experimental feature resolves usable (status `ready`, not killed). We do NOT
 * invent a new flag — we reuse the existing experimental-features registry (same
 * pattern as `resolveUnifiedSearchGate`).
 */
describe("resolveTemplateMarketplaceGate", () => {
	test("open when the feature is available", () => {
		expect(resolveTemplateMarketplaceGate().enabled).toBe(true);
	});

	test("respects a platform kill switch on templates.marketplace", () => {
		expect(resolveTemplateMarketplaceGate({ killSwitched: true }).enabled).toBe(
			false,
		);
	});

	test("the underlying feature is registered ready (so the gate can open)", () => {
		// Anchors the flip: a planned status would resolve `not_implemented` and the
		// gate would stay closed. With `ready` the availability is `available`.
		const state = resolveExperimentalFeatureState("templates.marketplace", {
			overrides: { "templates.marketplace": true },
		});
		expect(state.availability).toBe("available");
	});

	test("no required provider dependency (clean web flip)", () => {
		// The catalog is local; only the `desktop-runtime` runtime dep is declared,
		// which never gates a web surface. There must be no required provider dep.
		const state = resolveExperimentalFeatureState("templates.marketplace", {
			overrides: { "templates.marketplace": true },
		});
		const requiredProviders = state.dependencies.filter(
			(dependency) => dependency.kind === "provider" && dependency.required,
		);
		expect(requiredProviders).toHaveLength(0);
	});
});
