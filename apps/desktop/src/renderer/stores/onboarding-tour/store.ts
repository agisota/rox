import type { SurfaceTourId } from "@rox/shared/onboarding";
import { create } from "zustand";
import {
	createJSONStorage,
	devtools,
	persist,
	type StateStorage,
} from "zustand/middleware";

export interface OnboardingTourUiState {
	activeTourId: SurfaceTourId | null;
	activeStepId: string | null;
	pausedAt: string | null;
	lastRoute: string | null;
	setActiveStep: (tourId: SurfaceTourId, stepId: string, route: string) => void;
	pause: (route: string) => void;
	resume: () => void;
	clear: () => void;
}

const initialState = {
	activeTourId: null,
	activeStepId: null,
	pausedAt: null,
	lastRoute: null,
} satisfies Pick<
	OnboardingTourUiState,
	"activeTourId" | "activeStepId" | "pausedAt" | "lastRoute"
>;

function createMemoryStorage(): StateStorage {
	const storage = new Map<string, string>();

	return {
		getItem: (name) => storage.get(name) ?? null,
		setItem: (name, value) => {
			storage.set(name, value);
		},
		removeItem: (name) => {
			storage.delete(name);
		},
	};
}

export const useOnboardingTourStore = create<OnboardingTourUiState>()(
	devtools(
		persist(
			(set) => ({
				...initialState,
				setActiveStep: (tourId, stepId, route) =>
					set({
						activeTourId: tourId,
						activeStepId: stepId,
						lastRoute: route,
						pausedAt: null,
					}),
				pause: (route) =>
					set({
						pausedAt: new Date().toISOString(),
						lastRoute: route,
					}),
				resume: () => set({ pausedAt: null }),
				clear: () => set(initialState),
			}),
			{
				name: "rox-onboarding-tour-v1",
				storage: createJSONStorage(() =>
					typeof localStorage === "undefined"
						? createMemoryStorage()
						: localStorage,
				),
			},
		),
		{ name: "OnboardingTour" },
	),
);
