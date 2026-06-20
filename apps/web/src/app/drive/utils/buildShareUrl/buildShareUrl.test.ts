import { describe, expect, it } from "bun:test";
import { buildShareUrl } from "./buildShareUrl";

describe("buildShareUrl", () => {
	it("builds /d/<token> on the provided web origin", () => {
		expect(buildShareUrl("abc123", "https://app.rox.one")).toBe(
			"https://app.rox.one/d/abc123",
		);
	});

	it("strips a trailing slash from the base", () => {
		expect(buildShareUrl("tok", "https://rox.one/")).toBe(
			"https://rox.one/d/tok",
		);
	});

	it("falls back to the canonical origin when no base is given", () => {
		expect(buildShareUrl("tok")).toBe("https://rox.one/d/tok");
		expect(buildShareUrl("tok", null)).toBe("https://rox.one/d/tok");
	});
});
