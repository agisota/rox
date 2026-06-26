import { describe, expect, it } from "bun:test";
import {
	ONBOARDING_TOURS,
	REQUIRED_SURFACE_TOUR_IDS,
} from "./onboardingTourRegistry";

describe("onboarding tour registry", () => {
	it("defines every required surface tour", () => {
		for (const tourId of REQUIRED_SURFACE_TOUR_IDS) {
			expect(ONBOARDING_TOURS[tourId]?.id).toBe(tourId);
		}
	});

	it("defines actionable steps with route and anchor", () => {
		for (const tour of Object.values(ONBOARDING_TOURS)) {
			expect(tour.required).toBe(true);
			expect(tour.surfaceName.trim().length).toBeGreaterThan(0);
			expect(tour.steps.length).toBeGreaterThan(0);

			for (const step of tour.steps) {
				expect(step.id.trim().length).toBeGreaterThan(0);
				expect(step.title.trim().length).toBeGreaterThan(0);
				expect(step.body.trim().length).toBeGreaterThan(0);
				expect(step.action.trim().length).toBeGreaterThan(0);
				expect(step.anchor.trim().length).toBeGreaterThan(0);
				expect(step.route.trim().length).toBeGreaterThan(0);
				expect(step.route.startsWith("/")).toBe(true);
			}
		}
	});
});
