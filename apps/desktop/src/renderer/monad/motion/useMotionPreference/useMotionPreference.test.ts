import { describe, expect, it } from "bun:test";
import { resolveMotion } from "./useMotionPreference";

describe("resolveMotion", () => {
	it("keeps full when the OS has no preference", () => {
		expect(resolveMotion("full", false)).toBe("full");
	});

	it("downgrades full to essential under OS reduced motion", () => {
		expect(resolveMotion("full", true)).toBe("essential");
	});

	it("always honours an explicit off", () => {
		expect(resolveMotion("off", false)).toBe("off");
		expect(resolveMotion("off", true)).toBe("off");
	});

	it("never upgrades essential", () => {
		expect(resolveMotion("essential", false)).toBe("essential");
		expect(resolveMotion("essential", true)).toBe("essential");
	});
});
