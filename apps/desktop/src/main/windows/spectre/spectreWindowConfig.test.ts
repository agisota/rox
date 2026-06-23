import { describe, expect, it } from "bun:test";
import { buildSpectreWindowConfig } from "./spectreWindowConfig";

describe("buildSpectreWindowConfig", () => {
	it("is a frameless, transparent, non-taskbar, always-on-top overlay", () => {
		const cfg = buildSpectreWindowConfig({
			isMac: true,
			preloadPath: "/x/preload/index.js",
		});
		expect(cfg.frame).toBe(false);
		expect(cfg.transparent).toBe(true);
		expect(cfg.skipTaskbar).toBe(true);
		expect(cfg.alwaysOnTop).toBe(true);
		expect(cfg.show).toBe(false); // shown only after did-finish-load
		expect(cfg.resizable).toBe(false);
		expect(cfg.webPreferences?.preload).toBe("/x/preload/index.js");
		expect(cfg.webPreferences?.partition).toBe("persist:rox");
	});

	it("uses panel type on macOS so it floats over fullscreen apps", () => {
		expect(buildSpectreWindowConfig({ isMac: true, preloadPath: "p" }).type).toBe(
			"panel",
		);
		expect(
			buildSpectreWindowConfig({ isMac: false, preloadPath: "p" }).type,
		).toBeUndefined();
	});
});
