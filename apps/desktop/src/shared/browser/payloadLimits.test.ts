import { describe, expect, it } from "bun:test";
import {
	base64ByteSize,
	isScreenshotWithinLimit,
	MAX_HTML_BYTES,
	MAX_SCREENSHOT_BYTES,
	truncateHtml,
} from "./payloadLimits";

describe("payloadLimits", () => {
	it("leaves small HTML untouched", () => {
		const html = "<div>hi</div>";
		expect(truncateHtml(html)).toEqual({ html, truncated: false });
	});

	it("truncates oversized HTML to within the byte budget and marks it", () => {
		const html = "x".repeat(MAX_HTML_BYTES + 5000);
		const result = truncateHtml(html);
		expect(result.truncated).toBe(true);
		expect(Buffer.byteLength(result.html, "utf8")).toBeLessThanOrEqual(
			MAX_HTML_BYTES,
		);
		expect(result.html).toContain("truncated by Rox Design Mode");
	});

	it("respects a custom byte budget", () => {
		const result = truncateHtml("y".repeat(500), 100);
		expect(result.truncated).toBe(true);
		expect(Buffer.byteLength(result.html, "utf8")).toBeLessThanOrEqual(100);
	});

	it("never exceeds the budget even when smaller than the notice", () => {
		const result = truncateHtml("y".repeat(500), 10);
		expect(result.truncated).toBe(true);
		expect(Buffer.byteLength(result.html, "utf8")).toBeLessThanOrEqual(10);
		expect(result.html).not.toContain("truncated by Rox Design Mode");
	});

	it("returns empty for a non-positive budget", () => {
		expect(truncateHtml("abc", 0)).toEqual({ html: "", truncated: true });
	});

	it("does not leave a dangling replacement char on multibyte truncation", () => {
		const result = truncateHtml("😀".repeat(200), 120);
		expect(result.html).not.toMatch(/�/u);
	});

	it("enforces the screenshot limit", () => {
		expect(isScreenshotWithinLimit(MAX_SCREENSHOT_BYTES)).toBe(true);
		expect(isScreenshotWithinLimit(MAX_SCREENSHOT_BYTES + 1)).toBe(false);
	});

	it("computes base64 decoded size", () => {
		expect(base64ByteSize("")).toBe(0);
		// "hello" -> aGVsbG8=
		expect(base64ByteSize("aGVsbG8=")).toBe(5);
		// "hi" -> aGk=
		expect(base64ByteSize("aGk=")).toBe(2);
	});
});
