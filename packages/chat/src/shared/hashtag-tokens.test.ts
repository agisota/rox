import { describe, expect, it } from "bun:test";
import {
	extractHashtags,
	type HashtagSegment,
	hasHashtags,
	parseHashtagSegments,
} from "./hashtag-tokens";

/** The plain concatenation of every segment must reproduce the input. */
function reassemble(segments: HashtagSegment[]): string {
	return segments.map((segment) => segment.text).join("");
}

describe("parseHashtagSegments", () => {
	it("returns no segments for an empty title", () => {
		expect(parseHashtagSegments("")).toEqual([]);
	});

	it("returns a single text segment when there is no tag", () => {
		expect(parseHashtagSegments("design review")).toEqual([
			{ kind: "text", text: "design review" },
		]);
	});

	it("splits a leading tag from the following text", () => {
		expect(parseHashtagSegments("#design review")).toEqual([
			{ kind: "tag", text: "#design", tag: "design" },
			{ kind: "text", text: " review" },
		]);
	});

	it("captures a tag in the middle and at the end", () => {
		expect(parseHashtagSegments("plan #q3 launch #marketing")).toEqual([
			{ kind: "text", text: "plan " },
			{ kind: "tag", text: "#q3", tag: "q3" },
			{ kind: "text", text: " launch " },
			{ kind: "tag", text: "#marketing", tag: "marketing" },
		]);
	});

	it("keeps a mid-word # as plain text (not a tag)", () => {
		expect(parseHashtagSegments("see page#section now")).toEqual([
			{ kind: "text", text: "see page#section now" },
		]);
	});

	it("supports underscores and hyphens inside a tag", () => {
		expect(parseHashtagSegments("#high_priority #v1-2")).toEqual([
			{ kind: "tag", text: "#high_priority", tag: "high_priority" },
			{ kind: "text", text: " " },
			{ kind: "tag", text: "#v1-2", tag: "v1-2" },
		]);
	});

	it("trims trailing separators out of the canonical tag", () => {
		const segments = parseHashtagSegments("#design- done");
		expect(segments).toEqual([
			{ kind: "tag", text: "#design", tag: "design" },
			{ kind: "text", text: "- done" },
		]);
	});

	it("keeps a separator-only tag body as plain text", () => {
		expect(parseHashtagSegments("a #- b")).toEqual([
			{ kind: "text", text: "a #- b" },
		]);
	});

	it("supports non-Latin tag scripts", () => {
		expect(parseHashtagSegments("план #дизайн")).toEqual([
			{ kind: "text", text: "план " },
			{ kind: "tag", text: "#дизайн", tag: "дизайн" },
		]);
	});

	it("is lossless: segments reassemble to the original title", () => {
		const title = "  #a, #b-c done #ignore#nope end #last  ";
		expect(reassemble(parseHashtagSegments(title))).toBe(title);
	});
});

describe("extractHashtags", () => {
	it("returns distinct tags in first-seen order", () => {
		expect(extractHashtags("#b #a #b #c")).toEqual(["b", "a", "c"]);
	});

	it("dedupes case-insensitively, keeping the first casing", () => {
		expect(extractHashtags("#Design plan #design #DESIGN")).toEqual(["Design"]);
	});

	it("returns an empty list when there are no tags", () => {
		expect(extractHashtags("just a title")).toEqual([]);
	});
});

describe("hasHashtags", () => {
	it("is true when a tag is present", () => {
		expect(hasHashtags("plan #q3")).toBe(true);
	});

	it("is false for plain text and mid-word #", () => {
		expect(hasHashtags("page#section")).toBe(false);
		expect(hasHashtags("no tags here")).toBe(false);
	});
});
