import { describe, expect, test } from "bun:test";
import { driveShareUrl } from "./shareUrl";

describe("driveShareUrl", () => {
	test("builds the public share link from a token", () => {
		expect(driveShareUrl("abc123")).toBe("https://rox.one/d/abc123");
	});
});
