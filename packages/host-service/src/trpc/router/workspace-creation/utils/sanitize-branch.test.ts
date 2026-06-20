import { describe, expect, test } from "bun:test";
import { deduplicateBranchName } from "./sanitize-branch";

describe("deduplicateBranchName", () => {
	test("returns the candidate unchanged when there is no collision", () => {
		expect(deduplicateBranchName("feature/foo", ["other", "main"])).toBe(
			"feature/foo",
		);
	});

	test("returns empty candidate unchanged (short-circuit)", () => {
		expect(deduplicateBranchName("", ["main"])).toBe("");
	});

	test("returns candidate unchanged when the existing list is empty", () => {
		expect(deduplicateBranchName("feature/foo", [])).toBe("feature/foo");
	});

	test("appends -2 on the first collision", () => {
		expect(deduplicateBranchName("feature", ["feature"])).toBe("feature-2");
	});

	test("walks up suffixes until a free slot is found", () => {
		expect(
			deduplicateBranchName("feature", ["feature", "feature-2", "feature-3"]),
		).toBe("feature-4");
	});

	test("collision detection is case-insensitive", () => {
		expect(deduplicateBranchName("Feature", ["feature"])).toBe("Feature-2");
	});

	test("case-insensitive against existing suffixed names", () => {
		expect(deduplicateBranchName("Feature", ["feature", "FEATURE-2"])).toBe(
			"Feature-3",
		);
	});

	test("non-contiguous taken suffixes still find the lowest free one", () => {
		expect(
			deduplicateBranchName("feature", ["feature", "feature-3", "feature-4"]),
		).toBe("feature-2");
	});

	test("truncates an over-length base before appending the suffix", () => {
		const longName = "a".repeat(120);
		const result = deduplicateBranchName(longName, [longName]);
		// MAX_BRANCH_LENGTH (100) - SUFFIX_RESERVE (6) = 94-char base, plus "-2".
		expect(result).toBe(`${"a".repeat(94)}-2`);
		expect(result.length).toBeLessThanOrEqual(100);
	});

	test("strips trailing dashes/dots created by truncation before the suffix", () => {
		const base = `${"a".repeat(92)}--...`; // 100 chars, sliced to 94 then trimmed
		const result = deduplicateBranchName(base, [base]);
		expect(result.endsWith("-2")).toBe(true);
		// No double dash directly before the suffix.
		expect(result).not.toContain("--2");
		expect(result.length).toBeLessThanOrEqual(100);
	});

	test("does not truncate names at or below the reserve threshold", () => {
		const name = "b".repeat(94); // exactly MAX - SUFFIX_RESERVE
		expect(deduplicateBranchName(name, [name])).toBe(`${name}-2`);
	});
});
