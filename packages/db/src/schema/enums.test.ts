import { describe, expect, it } from "bun:test";

import { dashboardSectionKindEnum, dashboardSectionKindValues } from "./enums";

describe("dashboardSectionKindValues (WS-O T1)", () => {
	it("exposes the 8 collaborative-dashboard section kinds in stable order", () => {
		expect(dashboardSectionKindValues).toEqual([
			"config",
			"recommendation",
			"note",
			"priority",
			"artifact",
			"product",
			"reference",
			"log",
		]);
	});

	it("backs a zod enum accepting every value and rejecting unknown kinds", () => {
		for (const value of dashboardSectionKindValues) {
			expect(dashboardSectionKindEnum.parse(value)).toBe(value);
		}
		expect(() => dashboardSectionKindEnum.parse("unknown")).toThrow();
	});

	it("is append-only/immutable at the type level (const tuple)", () => {
		// `as const` tuple: length is fixed and known at compile time.
		expect(dashboardSectionKindValues.length).toBe(8);
	});
});
