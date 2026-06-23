import { describe, expect, it } from "bun:test";
import { presetToRrule, rruleToPreset } from "./recurrenceOptions";

const at9 = new Date("2026-06-01T09:00:00.000Z"); // a Monday

describe("presetToRrule", () => {
	it("returns null for 'none'", () => {
		expect(presetToRrule("none", at9, "")).toBeNull();
	});

	it("builds a daily rule anchored at the start time", () => {
		expect(presetToRrule("daily", at9, "")).toBe(
			"FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		);
	});

	it("builds a weekdays rule", () => {
		expect(presetToRrule("weekdays", at9, "")).toBe(
			"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
		);
	});

	it("builds a weekly rule on the start's weekday", () => {
		expect(presetToRrule("weekly", at9, "")).toBe(
			"FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
		);
	});

	it("passes a custom rule through, trimmed; empty → null", () => {
		expect(presetToRrule("custom", at9, " FREQ=MONTHLY ")).toBe("FREQ=MONTHLY");
		expect(presetToRrule("custom", at9, "   ")).toBeNull();
	});
});

describe("rruleToPreset", () => {
	it("maps null → none", () => {
		expect(rruleToPreset(null)).toBe("none");
	});

	it("recognises daily / weekdays / weekly", () => {
		expect(rruleToPreset("FREQ=DAILY;BYHOUR=9;BYMINUTE=0")).toBe("daily");
		expect(
			rruleToPreset("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0"),
		).toBe("weekdays");
		expect(rruleToPreset("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0")).toBe(
			"weekly",
		);
	});

	it("falls back to custom for anything else", () => {
		expect(rruleToPreset("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("custom");
	});
});
