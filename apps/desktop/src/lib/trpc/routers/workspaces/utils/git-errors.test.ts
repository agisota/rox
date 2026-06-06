import { describe, expect, it } from "bun:test";
import { categorizeGitError } from "./git-errors";

describe("categorizeGitError", () => {
	it("classifies network failures", () => {
		expect(
			categorizeGitError("fatal: Could not resolve host: github.com", "origin")
				.message,
		).toContain("network");
	});

	it("classifies authentication failures", () => {
		expect(
			categorizeGitError("remote: Permission denied", "origin").message,
		).toContain("Authentication");
	});

	it("classifies a missing/unconfigured remote (and names it)", () => {
		expect(
			categorizeGitError("ERROR: Repository not found", "upstream").message,
		).toContain("upstream");
	});

	it("is case-insensitive over the patterns", () => {
		expect(
			categorizeGitError("SSL handshake failed", "origin").message,
		).toContain("network");
	});

	it("falls back to a generic message that echoes the error", () => {
		const result = categorizeGitError("some unrecognized failure", "origin");
		expect(result.status).toBe("error");
		expect(result.message).toContain("some unrecognized failure");
	});
});
