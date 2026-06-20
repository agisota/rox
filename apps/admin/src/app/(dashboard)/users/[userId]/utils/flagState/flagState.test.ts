import { describe, expect, test } from "bun:test";

import {
	effectiveLabel,
	nextFlagState,
	overrideToState,
	stateToOverride,
} from "./flagState";

describe("flagState (T7)", () => {
	test("overrideToState maps the tri-state", () => {
		expect(overrideToState(true)).toBe("on");
		expect(overrideToState(false)).toBe("off");
		expect(overrideToState(null)).toBe("inherit");
	});

	test("stateToOverride is the inverse", () => {
		expect(stateToOverride("on")).toBe(true);
		expect(stateToOverride("off")).toBe(false);
		expect(stateToOverride("inherit")).toBeNull();
	});

	test("nextFlagState cycles on -> off -> inherit -> on", () => {
		expect(nextFlagState("on")).toBe("off");
		expect(nextFlagState("off")).toBe("inherit");
		expect(nextFlagState("inherit")).toBe("on");
	});

	test("effectiveLabel reflects the boolean", () => {
		expect(effectiveLabel(true)).toBe("Enabled");
		expect(effectiveLabel(false)).toBe("Disabled");
	});
});
