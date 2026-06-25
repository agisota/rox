import { beforeEach, describe, expect, it } from "bun:test";
import { useOnboardingTourStore } from "./store";

beforeEach(() => {
	useOnboardingTourStore.getState().clear();
});

describe("useOnboardingTourStore", () => {
	it("setActiveStep stores tour identity, step, and route", () => {
		useOnboardingTourStore
			.getState()
			.setActiveStep("workspaces", "open-workspaces", "/v2-workspaces");

		expect(useOnboardingTourStore.getState()).toMatchObject({
			activeTourId: "workspaces",
			activeStepId: "open-workspaces",
			pausedAt: null,
			lastRoute: "/v2-workspaces",
		});
	});

	it("pause preserves active tour identity and records the current route", () => {
		useOnboardingTourStore
			.getState()
			.setActiveStep("workspaces", "open-workspaces", "/v2-workspaces");

		useOnboardingTourStore.getState().pause("/settings");

		const state = useOnboardingTourStore.getState();
		expect(state.activeTourId).toBe("workspaces");
		expect(state.activeStepId).toBe("open-workspaces");
		expect(state.lastRoute).toBe("/settings");
		expect(state.pausedAt).toEqual(expect.any(String));
		expect(Number.isNaN(Date.parse(state.pausedAt ?? ""))).toBe(false);
	});

	it("resume clears pausedAt without changing the active step", () => {
		useOnboardingTourStore
			.getState()
			.setActiveStep("workspaces", "open-workspaces", "/v2-workspaces");
		useOnboardingTourStore.getState().pause("/v2-workspaces");

		useOnboardingTourStore.getState().resume();

		expect(useOnboardingTourStore.getState()).toMatchObject({
			activeTourId: "workspaces",
			activeStepId: "open-workspaces",
			pausedAt: null,
			lastRoute: "/v2-workspaces",
		});
	});

	it("clear resets the local tour state", () => {
		useOnboardingTourStore
			.getState()
			.setActiveStep("workspaces", "open-workspaces", "/v2-workspaces");
		useOnboardingTourStore.getState().pause("/settings");

		useOnboardingTourStore.getState().clear();

		expect(useOnboardingTourStore.getState()).toMatchObject({
			activeTourId: null,
			activeStepId: null,
			pausedAt: null,
			lastRoute: null,
		});
	});
});
