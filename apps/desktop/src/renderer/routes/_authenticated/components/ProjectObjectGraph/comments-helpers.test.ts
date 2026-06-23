import { describe, expect, it } from "bun:test";
import {
	COMMENT_MAX_LENGTH,
	canSubmitComment,
	type PanelComment,
	sortCommentsOldestFirst,
} from "./comments-helpers";

function comment(id: string, createdAt: string | Date): PanelComment {
	return {
		id,
		threadId: "t1",
		authorUserId: "u1",
		body: id,
		createdAt,
	};
}

describe("sortCommentsOldestFirst (chat transcript order)", () => {
	it("orders by createdAt ascending and does not mutate the input", () => {
		const input = [
			comment("c3", "2026-01-03T00:00:00Z"),
			comment("c1", "2026-01-01T00:00:00Z"),
			comment("c2", "2026-01-02T00:00:00Z"),
		];
		const sorted = sortCommentsOldestFirst(input);
		expect(sorted.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
		// Non-mutating: original order preserved.
		expect(input.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
	});

	it("handles Date instances and ISO strings interchangeably", () => {
		const sorted = sortCommentsOldestFirst([
			comment("late", new Date("2026-06-02T00:00:00Z")),
			comment("early", "2026-06-01T00:00:00Z"),
		]);
		expect(sorted.map((c) => c.id)).toEqual(["early", "late"]);
	});

	it("returns an empty array for no comments", () => {
		expect(sortCommentsOldestFirst([])).toEqual([]);
	});
});

describe("canSubmitComment (compose-box guard)", () => {
	it("is false for empty or whitespace-only drafts", () => {
		expect(canSubmitComment("", false)).toBe(false);
		expect(canSubmitComment("   \n\t", false)).toBe(false);
	});

	it("is true for a non-empty trimmed draft when not pending", () => {
		expect(canSubmitComment("  hello  ", false)).toBe(true);
	});

	it("is false while a submit is already pending (no double-send)", () => {
		expect(canSubmitComment("hello", true)).toBe(false);
	});

	it("is false when the draft exceeds the length cap", () => {
		const tooLong = "x".repeat(COMMENT_MAX_LENGTH + 1);
		expect(canSubmitComment(tooLong, false)).toBe(false);
		// Exactly at the cap is allowed.
		expect(canSubmitComment("x".repeat(COMMENT_MAX_LENGTH), false)).toBe(true);
	});
});
