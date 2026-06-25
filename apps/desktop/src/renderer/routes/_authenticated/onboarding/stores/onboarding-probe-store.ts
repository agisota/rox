import { PROBE_IDLE, type ProbeState } from "@rox/shared/wizard";
import { create } from "zustand";

/**
 * Onboarding probe store (F48, #637).
 *
 * The probe step (`credential/page.tsx`) runs the live `/models` probe and
 * writes its {@link ProbeState} here; the wizard footer in `layout.tsx` reads it
 * to gate "Continue" (enabled only on status === "ok"). A tiny shared store
 * keeps the gate state in sync across the body route and the footer without
 * threading props through the router Outlet — the same split the existing
 * `useSetupChromeStore` uses for the Back target.
 */
interface OnboardingProbeState {
	probe: ProbeState;
	setProbe: (probe: ProbeState) => void;
	reset: () => void;
}

export const useOnboardingProbeStore = create<OnboardingProbeState>((set) => ({
	probe: PROBE_IDLE,
	setProbe: (probe) => set({ probe }),
	reset: () => set({ probe: PROBE_IDLE }),
}));
