import { describe, expect, it } from "bun:test";
import { CLIError, suggestSimilar } from "./errors";

describe("CLIError", () => {
	it("sets the message and name", () => {
		const err = new CLIError("something broke");
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe("something broke");
		expect(err.name).toBe("CLIError");
	});

	it("leaves suggestion undefined when not provided", () => {
		const err = new CLIError("oops");
		expect(err.suggestion).toBeUndefined();
	});

	it("stores the optional suggestion", () => {
		const err = new CLIError("bad value", "try --help");
		expect(err.suggestion).toBe("try --help");
	});
});

describe("suggestSimilar", () => {
	it("returns the closest candidate within the default threshold", () => {
		expect(suggestSimilar("buidl", ["build", "test", "lint"])).toBe("build");
	});

	it("returns an exact match (distance 0)", () => {
		expect(suggestSimilar("build", ["build", "test"])).toBe("build");
	});

	it("returns undefined when no candidate is within the threshold", () => {
		expect(suggestSimilar("xyz", ["build", "test"])).toBeUndefined();
	});

	it("returns undefined for an empty candidate list", () => {
		expect(suggestSimilar("build", [])).toBeUndefined();
	});

	it("treats a transposition as a single edit (Damerau)", () => {
		// "biuld" -> "build" is one adjacent transposition (distance 1)
		expect(suggestSimilar("biuld", ["build"])).toBe("build");
	});

	it("respects a custom (tighter) threshold", () => {
		// distance("ab", "abcd") === 2, so threshold 1 rejects it
		expect(suggestSimilar("ab", ["abcd"], 1)).toBeUndefined();
		expect(suggestSimilar("ab", ["abcd"], 2)).toBe("abcd");
	});

	it("picks the first candidate when distances tie", () => {
		// "cat" is distance 1 from both "bat" and "car"; first wins
		expect(suggestSimilar("cat", ["bat", "car"])).toBe("bat");
	});
});
