import { describe, expect, it } from "bun:test";
import { setDevicePresetInputSchema } from "./schemas";

describe("browser schemas", () => {
	it("requires custom dimensions for the custom preset", () => {
		const result = setDevicePresetInputSchema.safeParse({
			paneId: "pane-1",
			presetId: "custom",
		});

		expect(result.success).toBe(false);
	});

	it("rejects custom dimensions for built-in presets", () => {
		const result = setDevicePresetInputSchema.safeParse({
			paneId: "pane-1",
			presetId: "iphone-15",
			custom: { width: 390, height: 844 },
		});

		expect(result.success).toBe(false);
	});

	it("accepts custom dimensions only with the custom preset", () => {
		const result = setDevicePresetInputSchema.safeParse({
			paneId: "pane-1",
			presetId: "custom",
			custom: { width: 390, height: 844 },
		});

		expect(result.success).toBe(true);
	});
});
