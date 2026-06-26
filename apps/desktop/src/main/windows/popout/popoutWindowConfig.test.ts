import { describe, expect, it } from "bun:test";
import { buildPopoutWindowConfig } from "./popoutWindowConfig";

const baseInput = {
	preloadPath: "/x/preload/index.js",
	bounds: {
		width: 800,
		height: 600,
		center: true,
		isMaximized: false,
	},
	glassOptions: { backgroundColor: "#252525" },
	title: "Rox — Chat",
};

describe("buildPopoutWindowConfig", () => {
	it("is a frameless, resizable, non-always-on-top glass window", () => {
		const cfg = buildPopoutWindowConfig(baseInput);
		expect(cfg.frame).toBe(false);
		expect(cfg.titleBarStyle).toBe("hidden");
		expect(cfg.resizable).toBe(true);
		expect(cfg.alwaysOnTop).toBe(false);
		expect(cfg.show).toBe(false); // shown only after ready-to-show
		expect(cfg.title).toBe("Rox — Chat");
	});

	it("shares the main window's isolated rox session partition", () => {
		const cfg = buildPopoutWindowConfig(baseInput);
		expect(cfg.webPreferences?.partition).toBe("persist:rox");
		expect(cfg.webPreferences?.preload).toBe("/x/preload/index.js");
		expect(cfg.webPreferences?.webviewTag).toBe(true);
	});

	it("applies restored bounds and merges glass options", () => {
		const cfg = buildPopoutWindowConfig({
			...baseInput,
			bounds: {
				x: 10,
				y: 20,
				width: 500,
				height: 400,
				center: false,
				isMaximized: false,
			},
			glassOptions: { transparent: true, vibrancy: "under-window" },
		});
		expect(cfg.x).toBe(10);
		expect(cfg.y).toBe(20);
		expect(cfg.width).toBe(500);
		expect(cfg.transparent).toBe(true);
		expect(cfg.vibrancy).toBe("under-window");
	});
});
