import { describe, expect, it } from "bun:test";

import {
	deriveHashtagTitleParts,
	type HashtagTitleSegment,
	hashtagColor,
} from "./hashtag-title";

const SEGMENTS: HashtagTitleSegment[] = [
	{ kind: "text", text: "plan " },
	{ kind: "tag", text: "#q3", tag: "q3" },
	{ kind: "text", text: " launch " },
	{ kind: "tag", text: "#q3", tag: "q3" },
];

describe("deriveHashtagTitleParts", () => {
	it("maps text segments to text parts and tag segments to chip parts", () => {
		const parts = deriveHashtagTitleParts(SEGMENTS);
		expect(parts.map((part) => part.kind)).toEqual([
			"text",
			"chip",
			"text",
			"chip",
		]);
	});

	it("keeps distinct keys for repeated tags", () => {
		const parts = deriveHashtagTitleParts(SEGMENTS);
		const keys = parts.map((part) => part.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("carries the canonical tag name as the chip click payload", () => {
		const chip = deriveHashtagTitleParts(SEGMENTS)[1];
		expect(chip).toMatchObject({ kind: "chip", tag: "q3", text: "#q3" });
	});

	it("colours a chip deterministically from the tag", () => {
		const chip = deriveHashtagTitleParts(SEGMENTS)[1];
		expect(chip?.kind).toBe("chip");
		expect(chip?.kind === "chip" ? chip.color : null).toBe(hashtagColor("q3"));
	});
});

describe("hashtagColor", () => {
	it("is stable for a given tag", () => {
		expect(hashtagColor("design")).toBe(hashtagColor("design"));
	});

	it("is case-insensitive", () => {
		expect(hashtagColor("Design")).toBe(hashtagColor("design"));
	});

	it("returns an HSL colour string", () => {
		expect(hashtagColor("design")).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
	});
});
