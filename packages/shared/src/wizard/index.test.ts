import { describe, expect, it } from "bun:test";

import {
	CONNECT_ONLY_CAPABILITIES,
	canContinue,
	canGoBack,
	createWizardNavState,
	DESKTOP_CAPABILITIES,
	ONBOARDING_STEP_SEQUENCE,
	PROBE_IDLE,
	type ProbeState,
	probeGateSatisfied,
	probeReducer,
	withStepCopy,
	wizardNavReducer,
} from "./index";

/**
 * Behaviour contract for the shared onboarding wizard core (F48 / #637). The
 * same reducers back the desktop DOM shell, the connect-only web host, and the
 * RN mobile host — so navigation bounds, the capability flags, and the probe
 * state machine (idle → probing → ok | error) plus its Continue gate must be a
 * single neutral source with no per-platform logic.
 */
describe("wizard step sequence", () => {
	it("fixes the canonical order system → setup → workspace → finish", () => {
		expect([...ONBOARDING_STEP_SEQUENCE]).toEqual([
			"system",
			"setup",
			"workspace",
			"finish",
		]);
	});

	it("merges host-supplied copy by id, falling back to the id", () => {
		const steps = withStepCopy({
			system: { title: "Запуск Rox", subtitle: "Подключите агентов." },
		});
		expect(steps).toHaveLength(4);
		expect(steps[0]).toEqual({
			id: "system",
			title: "Запуск Rox",
			subtitle: "Подключите агентов.",
			optional: undefined,
		});
		// Steps without copy fall back to their id as the title.
		expect(steps[3]?.title).toBe("finish");
	});
});

describe("wizard capabilities", () => {
	it("lets desktop install deps but not connect-only hosts", () => {
		expect(DESKTOP_CAPABILITIES.canInstallDeps).toBe(true);
		expect(CONNECT_ONLY_CAPABILITIES.canInstallDeps).toBe(false);
	});
});

describe("wizard nav reducer", () => {
	it("starts on the first step within bounds", () => {
		const state = createWizardNavState(4);
		expect(state.currentIndex).toBe(0);
		expect(canGoBack(state)).toBe(false);
		expect(canContinue(state)).toBe(true);
	});

	it("advances and rewinds, clamped to the step bounds", () => {
		let state = createWizardNavState(4);
		state = wizardNavReducer(state, { type: "next" });
		expect(state.currentIndex).toBe(1);
		expect(canGoBack(state)).toBe(true);
		// Cannot rewind past the first step.
		state = wizardNavReducer(state, { type: "back" });
		state = wizardNavReducer(state, { type: "back" });
		expect(state.currentIndex).toBe(0);
	});

	it("cannot advance past the last step", () => {
		let state = createWizardNavState(2);
		state = wizardNavReducer(state, { type: "next" });
		state = wizardNavReducer(state, { type: "next" });
		expect(state.currentIndex).toBe(1);
		// On the last step Continue is unavailable (host finalizes instead).
		expect(canContinue(state)).toBe(false);
	});

	it("goTo jumps within bounds", () => {
		const state = wizardNavReducer(createWizardNavState(4), {
			type: "goTo",
			index: 2,
		});
		expect(state.currentIndex).toBe(2);
		expect(
			wizardNavReducer(state, { type: "goTo", index: 99 }).currentIndex,
		).toBe(3);
	});

	it("gates Continue on a step-specific gate", () => {
		const state = createWizardNavState(4);
		expect(canContinue(state, false)).toBe(false);
		expect(canContinue(state, true)).toBe(true);
	});
});

describe("probe state machine", () => {
	it("transitions idle → probing → ok and exposes models", () => {
		let state: ProbeState = PROBE_IDLE;
		expect(state.status).toBe("idle");
		expect(probeGateSatisfied(state)).toBe(false);

		state = probeReducer(state, { type: "start" });
		expect(state.status).toBe("probing");
		expect(probeGateSatisfied(state)).toBe(false);

		state = probeReducer(state, {
			type: "success",
			models: ["gpt-4o", "gpt-4o-mini"],
		});
		expect(state.status).toBe("ok");
		expect(state.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
		// Only "ok" satisfies the Continue gate.
		expect(probeGateSatisfied(state)).toBe(true);
	});

	it("transitions idle → probing → error and blocks the gate", () => {
		let state: ProbeState = probeReducer(PROBE_IDLE, { type: "start" });
		state = probeReducer(state, { type: "failure", error: "401 Unauthorized" });
		expect(state.status).toBe("error");
		expect(state.error).toBe("401 Unauthorized");
		expect(probeGateSatisfied(state)).toBe(false);
	});

	it("reset returns to idle", () => {
		const ok = probeReducer(PROBE_IDLE, { type: "success", models: ["m"] });
		expect(probeReducer(ok, { type: "reset" })).toEqual(PROBE_IDLE);
	});
});
