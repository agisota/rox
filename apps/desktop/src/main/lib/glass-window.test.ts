import { describe, expect, it } from "bun:test";
import type { BrowserWindow } from "electron";
import { PLATFORM } from "shared/constants";
import { applyGlassToWindow, getGlassWindowOptions } from "./glass-window";

function createWindowStub(overrides?: { destroyed?: boolean }) {
	const vibrancyCalls: Parameters<BrowserWindow["setVibrancy"]>[0][] = [];
	const backgroundColorCalls: string[] = [];
	const window = {
		isDestroyed: () => overrides?.destroyed ?? false,
		setVibrancy: (value: Parameters<BrowserWindow["setVibrancy"]>[0]) => {
			vibrancyCalls.push(value);
		},
		setBackgroundColor: (value: string) => {
			backgroundColorCalls.push(value);
		},
	} satisfies Partial<BrowserWindow>;

	return {
		backgroundColorCalls,
		vibrancyCalls,
		window: window as BrowserWindow,
	};
}

describe("getGlassWindowOptions", () => {
	it("uses macOS vibrancy options when glass is enabled on macOS", () => {
		const options = getGlassWindowOptions(
			{ glassEnabled: true, windowOpacity: 0.3 },
			"#252525",
		);

		if (PLATFORM.IS_MAC) {
			expect(options).toEqual({
				transparent: true,
				vibrancy: "under-window",
				visualEffectState: "active",
				backgroundColor: "#00000000",
			});
			return;
		}

		expect(options).toEqual({ backgroundColor: "#252525" });
	});

	it("uses an opaque fallback when glass is disabled", () => {
		expect(
			getGlassWindowOptions(
				{ glassEnabled: false, windowOpacity: 0.3 },
				"#ffffff",
			),
		).toEqual({ backgroundColor: "#ffffff" });
	});
});

describe("applyGlassToWindow", () => {
	it("applies or skips vibrancy according to the current platform gate", () => {
		const { backgroundColorCalls, vibrancyCalls, window } = createWindowStub();

		applyGlassToWindow(
			window,
			{ glassEnabled: true, windowOpacity: 0.3 },
			"#252525",
		);

		if (PLATFORM.IS_MAC) {
			expect(vibrancyCalls).toEqual(["under-window"]);
			expect(backgroundColorCalls).toEqual(["#00000000"]);
			return;
		}

		expect(vibrancyCalls).toEqual([]);
		expect(backgroundColorCalls).toEqual([]);
	});

	it("clears vibrancy to the fallback background when disabled on macOS", () => {
		const { backgroundColorCalls, vibrancyCalls, window } = createWindowStub();

		applyGlassToWindow(
			window,
			{ glassEnabled: false, windowOpacity: 0.3 },
			"#252525",
		);

		if (PLATFORM.IS_MAC) {
			expect(vibrancyCalls).toEqual([null]);
			expect(backgroundColorCalls).toEqual(["#252525"]);
			return;
		}

		expect(vibrancyCalls).toEqual([]);
		expect(backgroundColorCalls).toEqual([]);
	});

	it("does not touch destroyed windows", () => {
		const { backgroundColorCalls, vibrancyCalls, window } = createWindowStub({
			destroyed: true,
		});

		applyGlassToWindow(
			window,
			{ glassEnabled: true, windowOpacity: 0.3 },
			"#252525",
		);

		expect(vibrancyCalls).toEqual([]);
		expect(backgroundColorCalls).toEqual([]);
	});
});
