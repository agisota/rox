import { describe, expect, it } from "bun:test";
import {
	createCustomPreset,
	DEFAULT_DEVICE_PRESET_ID,
	DEVICE_PRESETS,
	getDevicePreset,
	isEmulatedPreset,
	resolveDevicePreset,
} from "./devicePresets";

describe("devicePresets", () => {
	it("includes the spec-required presets", () => {
		const ids = DEVICE_PRESETS.map((p) => p.id);
		expect(ids).toEqual(
			expect.arrayContaining([
				"responsive",
				"iphone-se",
				"iphone-15",
				"pixel-8",
			]),
		);
	});

	it("marks mobile presets with touch + a mobile user agent", () => {
		for (const preset of DEVICE_PRESETS) {
			if (preset.id === "responsive") continue;
			expect(preset.isMobile).toBe(true);
			expect(preset.hasTouch).toBe(true);
			expect(preset.userAgent).toBeTruthy();
			expect(preset.width).toBeGreaterThan(0);
			expect(preset.deviceScaleFactor).toBeGreaterThanOrEqual(1);
		}
	});

	it("looks presets up by id", () => {
		expect(getDevicePreset("iphone-15")?.label).toBe("iPhone 15");
		expect(getDevicePreset("nope")).toBeUndefined();
	});

	it("resolves unknown/undefined ids to the responsive default", () => {
		expect(resolveDevicePreset(undefined).id).toBe(DEFAULT_DEVICE_PRESET_ID);
		expect(resolveDevicePreset("stale-preset").id).toBe(
			DEFAULT_DEVICE_PRESET_ID,
		);
		expect(resolveDevicePreset("pixel-8").id).toBe("pixel-8");
	});

	it("treats responsive as non-emulated and mobile presets as emulated", () => {
		expect(isEmulatedPreset(resolveDevicePreset("responsive"))).toBe(false);
		expect(isEmulatedPreset(resolveDevicePreset("iphone-se"))).toBe(true);
	});

	it("clamps custom presets to a safe range", () => {
		const tiny = createCustomPreset({ width: 1, height: 1 });
		expect(tiny.width).toBe(240);
		expect(tiny.height).toBe(240);

		const huge = createCustomPreset({
			width: 99999,
			height: 99999,
			deviceScaleFactor: 99,
		});
		expect(huge.width).toBe(4096);
		expect(huge.deviceScaleFactor).toBe(4);
		expect(huge.id).toBe("custom");
	});

	it("rounds fractional custom dimensions", () => {
		const p = createCustomPreset({ width: 375.6, height: 812.2 });
		expect(p.width).toBe(376);
		expect(p.height).toBe(812);
	});
});
