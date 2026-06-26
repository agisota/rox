import { describe, expect, it } from "bun:test";

import {
	DEFAULT_ONBOARDING_STATUS,
	getOnboardingPercentComplete,
	normalizeOnboardingStatus,
} from "./types";

describe("onboarding shared state", () => {
	it("fills missing branches from defaults", () => {
		expect(normalizeOnboardingStatus(null)).toEqual(DEFAULT_ONBOARDING_STATUS);
		expect(
			normalizeOnboardingStatus({
				activation: {
					completedAt: null,
					currentStep: "project",
					completedSteps: { provider: "2026-06-26T00:00:00.000Z" },
				},
			}).activation.currentStep,
		).toBe("project");
	});

	it("counts activation and required tours toward resume progress", () => {
		const status = normalizeOnboardingStatus({
			activation: {
				completedAt: "2026-06-26T00:00:00.000Z",
				currentStep: "first_agent_action",
				completedSteps: {},
			},
			tours: {
				activeTourId: null,
				activeStepId: null,
				pausedAt: null,
				completedSteps: {},
				completedTours: { workspaces: "2026-06-26T00:00:00.000Z" },
				dismissedTours: {},
			},
		});

		expect(getOnboardingPercentComplete(status)).toBe(50);
	});
});
