import { describe, expect, test } from "bun:test";
import {
	EXPERIMENTAL_FEATURE_CATEGORIES,
	EXPERIMENTAL_FEATURES,
	getExperimentalFeatureDefinition,
	isExperimentalFeatureId,
	listExperimentalFeatures,
	resolveExperimentalFeatureState,
} from ".";

describe("experimental features registry", () => {
	test("contains a complete unique default-on feature baseline", () => {
		const minimumFeatureCount = EXPERIMENTAL_FEATURE_CATEGORIES.length * 10;
		expect(EXPERIMENTAL_FEATURES.length).toBeGreaterThanOrEqual(
			minimumFeatureCount,
		);

		const ids = new Set(EXPERIMENTAL_FEATURES.map((feature) => feature.id));
		expect(ids.size).toBe(EXPERIMENTAL_FEATURES.length);

		for (const feature of EXPERIMENTAL_FEATURES) {
			expect(feature.defaultEnabled).toBe(true);
			expect(feature.owner.length).toBeGreaterThan(0);
			expect(feature.killSwitch.length).toBeGreaterThan(0);
			expect(feature.telemetryEvent).toContain("experimental_feature_");
			expect(feature.affectedSurfaces.length).toBeGreaterThan(0);
		}
	});

	test("keeps at least ten features per declared category", () => {
		const countsByCategory = new Map(
			EXPERIMENTAL_FEATURE_CATEGORIES.map((category) => [category, 0]),
		);
		for (const feature of EXPERIMENTAL_FEATURES) {
			countsByCategory.set(
				feature.category,
				(countsByCategory.get(feature.category) ?? 0) + 1,
			);
		}

		for (const category of EXPERIMENTAL_FEATURE_CATEGORIES) {
			const featureCount = countsByCategory.get(category) ?? 0;
			expect(listExperimentalFeatures(category)).toHaveLength(featureCount);
			expect(featureCount).toBeGreaterThanOrEqual(10);
		}
		const categorizedCount = Array.from(countsByCategory.values()).reduce(
			(total, count) => total + count,
			0,
		);
		expect(categorizedCount).toBe(EXPERIMENTAL_FEATURES.length);
	});

	test("resolves a disabled user override without changing availability", () => {
		const state = resolveExperimentalFeatureState(
			"agentNative.screenContextBus",
			{
				overrides: {
					"agentNative.screenContextBus": false,
				},
			},
		);

		expect(state.enabled).toBe(false);
		expect(state.userOverride).toBe(false);
		expect(state.availability).toBe("not_implemented");
	});

	test("reports missing provider configuration while preserving default-on preference", () => {
		const state = resolveExperimentalFeatureState("live.voiceRooms");

		expect(state.enabled).toBe(true);
		expect(state.userOverride).toBeNull();
		expect(state.availability).toBe("needs_configuration");
		expect(state.reason).toContain("LiveKit");
	});

	test("reports blocked kill switches as disabled", () => {
		const state = resolveExperimentalFeatureState("projectOs.workspaceShell", {
			killSwitches: {
				"projectOs.workspaceShell": true,
			},
		});

		expect(state.enabled).toBe(false);
		expect(state.availability).toBe("blocked");
	});

	test("guards unknown IDs", () => {
		expect(isExperimentalFeatureId("rooms.voiceToPr")).toBe(true);
		expect(isExperimentalFeatureId("missing.feature")).toBe(false);
		expect(getExperimentalFeatureDefinition("missing.feature")).toBeUndefined();
	});

	test("templates.marketplace ships a ready, locally-backed surface", () => {
		const definition = getExperimentalFeatureDefinition(
			"templates.marketplace",
		);
		expect(definition).toBeDefined();
		// The slice is powered by the local project-creation engine, so the only
		// required provider is the desktop runtime (no external catalog endpoint).
		expect(definition?.implementationStatus).toBe("ready");
		const requiredProviders = (definition?.dependencies ?? []).filter(
			(dependency) => dependency.kind === "provider" && dependency.required,
		);
		expect(requiredProviders).toHaveLength(0);
	});

	test("templates.marketplace resolves available with the desktop runtime", () => {
		const state = resolveExperimentalFeatureState("templates.marketplace", {
			dependencies: { "desktop-runtime": "configured" },
		});
		expect(state.enabled).toBe(true);
		expect(state.availability).toBe("available");
		expect(state.reason).toBeUndefined();
	});

	test("templates.marketplace stays hidden when disabled by the user", () => {
		const state = resolveExperimentalFeatureState("templates.marketplace", {
			dependencies: { "desktop-runtime": "configured" },
			overrides: { "templates.marketplace": false },
		});
		expect(state.enabled).toBe(false);
		expect(state.availability).toBe("available");
	});
});
