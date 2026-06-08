import { describe, expect, it } from "bun:test";
import { slugify } from "./slugify";

describe("slugify", () => {
	it("lowercases and hyphenates words", () => {
		expect(slugify("My First Note")).toBe("my-first-note");
	});

	it("collapses runs of punctuation and whitespace", () => {
		expect(slugify("Hello,   World!!!")).toBe("hello-world");
	});

	it("strips leading and trailing separators", () => {
		expect(slugify("  --Draft PRD--  ")).toBe("draft-prd");
	});

	it("strips accents", () => {
		expect(slugify("Café Plan")).toBe("cafe-plan");
	});

	it("returns an empty string when nothing is slug-able", () => {
		expect(slugify("!!!")).toBe("");
	});

	it("produces a slug accepted by the knowledge slug pattern", () => {
		const pattern = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
		expect(pattern.test(slugify("Q3 Roadmap — v2"))).toBe(true);
	});
});
