import { describe, expect, it } from "bun:test";
import { colors } from "./colors";

describe("email colors", () => {
	it("exposes the core email-safe palette keys", () => {
		expect(colors.background).toBe("#FFFFFF");
		expect(colors.foreground).toBe("#242424");
		expect(colors.primary).toBe("#343434");
		expect(colors.destructive).toBe("#E85D4A");
		expect(colors.border).toBe("#EBEBEB");
	});

	it("uses 6-digit hex values for every color", () => {
		for (const value of Object.values(colors)) {
			expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
		}
	});
});
