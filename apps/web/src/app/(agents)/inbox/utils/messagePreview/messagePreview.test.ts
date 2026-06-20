import { describe, expect, it } from "bun:test";

import { messagePreview } from "./messagePreview";

describe("messagePreview", () => {
	it("returns an empty string for nullish bodies", () => {
		expect(messagePreview(null)).toBe("");
		expect(messagePreview(undefined)).toBe("");
	});

	it("collapses internal whitespace to single spaces", () => {
		expect(messagePreview("hello\n\n  world\tagain")).toBe("hello world again");
	});

	it("returns short bodies unchanged", () => {
		expect(messagePreview("short message")).toBe("short message");
	});

	it("clamps and ellipsizes long bodies", () => {
		const long = "a".repeat(200);
		const out = messagePreview(long, 10);
		expect(out.length).toBe(10);
		expect(out.endsWith("…")).toBe(true);
	});
});
