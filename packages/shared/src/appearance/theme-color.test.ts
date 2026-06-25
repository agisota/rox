import { describe, expect, it } from "bun:test";
import {
	CHROME_COLOR_VAR_PRIORITY,
	type ChromeColorVar,
	resolveChromeColor,
} from "./theme-color";

/** Build a reader from a plain map of var → computed value. */
function reader(map: Partial<Record<ChromeColorVar, string | null>>) {
	return (name: ChromeColorVar) => map[name] ?? null;
}

describe("resolveChromeColor", () => {
	it("prefers the workspace accent when present", () => {
		expect(
			resolveChromeColor(
				reader({
					"--workspace-accent": "rgb(10, 20, 30)",
					"--background": "rgb(0, 0, 0)",
				}),
			),
		).toBe("rgb(10, 20, 30)");
	});

	it("falls back to --background when the accent is unset (F25 inactive)", () => {
		expect(
			resolveChromeColor(
				reader({ "--workspace-accent": "", "--background": "rgb(0, 0, 0)" }),
			),
		).toBe("rgb(0, 0, 0)");
	});

	it("trims surrounding whitespace from the computed value", () => {
		expect(
			resolveChromeColor(reader({ "--background": "  rgb(1, 2, 3)  " })),
		).toBe("rgb(1, 2, 3)");
	});

	it("returns null when no source variable resolves", () => {
		expect(
			resolveChromeColor(
				reader({ "--workspace-accent": "", "--background": "" }),
			),
		).toBeNull();
		expect(resolveChromeColor(() => null)).toBeNull();
	});

	it("checks variables in the documented priority order", () => {
		expect(CHROME_COLOR_VAR_PRIORITY).toEqual([
			"--workspace-accent",
			"--background",
		]);
	});
});
