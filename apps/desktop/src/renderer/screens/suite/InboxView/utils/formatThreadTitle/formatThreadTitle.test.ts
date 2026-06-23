import { describe, expect, it } from "bun:test";
import { formatThreadTitle } from "./formatThreadTitle";

describe("formatThreadTitle", () => {
	it("returns the trimmed subject when present", () => {
		expect(
			formatThreadTitle({ subject: "  Привет команде  ", id: "abc12345" }),
		).toBe("Привет команде");
	});

	it("falls back to a short thread id when subject is empty/whitespace", () => {
		expect(formatThreadTitle({ subject: "   ", id: "abcdef0123456789" })).toBe(
			"Тред abcdef01",
		);
		expect(formatThreadTitle({ subject: "", id: "abcdef0123456789" })).toBe(
			"Тред abcdef01",
		);
	});

	it("falls back when subject is null or undefined", () => {
		expect(formatThreadTitle({ subject: null, id: "deadbeefcafe" })).toBe(
			"Тред deadbeef",
		);
		expect(formatThreadTitle({ subject: undefined, id: "deadbeefcafe" })).toBe(
			"Тред deadbeef",
		);
	});
});
