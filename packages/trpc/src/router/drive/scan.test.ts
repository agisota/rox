import { describe, expect, test } from "bun:test";

import { isBlockedMediaType, scanObject } from "./scan";

describe("isBlockedMediaType (D5 allow-list)", () => {
	test("blocks executable / script payloads", () => {
		for (const t of [
			"application/x-msdownload",
			"application/x-sh",
			"application/x-shellscript",
			"application/java-archive",
			"application/vnd.microsoft.portable-executable",
		]) {
			expect(isBlockedMediaType(t)).toBe(true);
		}
	});

	test("ignores params + casing when matching the block-list", () => {
		expect(isBlockedMediaType("APPLICATION/X-SH; charset=utf-8")).toBe(true);
	});

	test("blocks an empty / whitespace media type", () => {
		expect(isBlockedMediaType("")).toBe(true);
		expect(isBlockedMediaType("   ")).toBe(true);
	});

	test("allows ordinary documents / media", () => {
		for (const t of [
			"application/pdf",
			"image/png",
			"image/jpeg",
			"text/plain",
			"application/zip",
			"video/mp4",
		]) {
			expect(isBlockedMediaType(t)).toBe(false);
		}
	});
});

describe("scanObject (D5 stub gate)", () => {
	test("returns a clean verdict with an audit record", async () => {
		const r = await scanObject({
			storageKey: "u/user-1/abc",
			sizeBytes: 100,
			mediaType: "application/pdf",
		});
		expect(r.verdict).toBe("clean");
		expect(r.result.verdict).toBe("clean");
		expect(typeof r.result.ts).toBe("string");
	});
});
