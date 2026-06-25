import { describe, expect, test } from "bun:test";

import {
	createSavedViewSchema,
	SAVED_VIEW_NAME_MAX,
	savedViewIdSchema,
	updateSavedViewSchema,
} from "./saved-views-schema";

describe("createSavedViewSchema", () => {
	test("accepts a name with no rule/colour (server defaults both)", () => {
		const parsed = createSavedViewSchema.parse({ name: "Bugs" });
		expect(parsed.name).toBe("Bugs");
		expect(parsed.rule).toBeUndefined();
		expect(parsed.color).toBeUndefined();
	});

	test("trims the name and accepts a boolean rule", () => {
		const parsed = createSavedViewSchema.parse({
			name: "  Active bugs  ",
			rule: { labelsAll: ["bug"], labelsNone: ["done"], status: "active" },
		});
		expect(parsed.name).toBe("Active bugs");
		expect(parsed.rule?.labelsAll).toEqual(["bug"]);
		expect(parsed.rule?.labelsNone).toEqual(["done"]);
	});

	test("rejects an empty name", () => {
		expect(() => createSavedViewSchema.parse({ name: "   " })).toThrow();
	});

	test("rejects a name over the length cap", () => {
		expect(() =>
			createSavedViewSchema.parse({
				name: "x".repeat(SAVED_VIEW_NAME_MAX + 1),
			}),
		).toThrow();
	});

	test("rejects an invalid rule (unknown axis)", () => {
		expect(() =>
			createSavedViewSchema.parse({ name: "x", rule: { bogus: 1 } }),
		).toThrow();
	});
});

describe("updateSavedViewSchema", () => {
	test("requires a savedViewId uuid", () => {
		expect(() => updateSavedViewSchema.parse({ name: "x" })).toThrow();
		expect(() =>
			updateSavedViewSchema.parse({ savedViewId: "nope" }),
		).toThrow();
	});

	test("allows clearing the colour with null", () => {
		const parsed = updateSavedViewSchema.parse({
			savedViewId: "00000000-0000-0000-0000-000000000000",
			color: null,
		});
		expect(parsed.color).toBeNull();
	});
});

describe("savedViewIdSchema", () => {
	test("requires a uuid", () => {
		expect(() => savedViewIdSchema.parse({ savedViewId: "x" })).toThrow();
		expect(
			savedViewIdSchema.parse({
				savedViewId: "00000000-0000-0000-0000-000000000000",
			}).savedViewId,
		).toBe("00000000-0000-0000-0000-000000000000");
	});
});
