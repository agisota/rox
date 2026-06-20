import { describe, expect, it } from "bun:test";

import { formatThreadTitle } from "./formatThreadTitle";

describe("formatThreadTitle", () => {
	it("uses the subject when present", () => {
		expect(
			formatThreadTitle({ subject: "Релиз v2", id: "abcdef12-0000" }),
		).toBe("Релиз v2");
	});

	it("trims whitespace-only subjects to the id fallback", () => {
		expect(formatThreadTitle({ subject: "   ", id: "abcdef12-3456" })).toBe(
			"Тред abcdef12",
		);
	});

	it("falls back to a short id when subject is null", () => {
		expect(formatThreadTitle({ subject: null, id: "abcdef12-3456" })).toBe(
			"Тред abcdef12",
		);
	});

	it("falls back when subject is undefined", () => {
		expect(formatThreadTitle({ subject: undefined, id: "deadbeef-9999" })).toBe(
			"Тред deadbeef",
		);
	});
});
