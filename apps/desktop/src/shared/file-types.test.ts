import { describe, expect, test } from "bun:test";
import {
	getCsvDelimiter,
	getImageExtensionFromMimeType,
	getImageMimeType,
	hasRenderedPreview,
	isBinaryReadableFile,
	isCsvFile,
	isHtmlFile,
	isPdfFile,
	parseBase64DataUrl,
} from "./file-types";

const PNG_BASE64 = Buffer.from("png").toString("base64");

describe("file-types", () => {
	test("maps image file paths to MIME types", () => {
		expect(getImageMimeType("logo.svg")).toBe("image/svg+xml");
		expect(getImageMimeType("logo.ico")).toBe("image/x-icon");
		expect(getImageMimeType("logo.unknown")).toBeNull();
	});

	test("maps image MIME types to preferred extensions", () => {
		expect(getImageExtensionFromMimeType("image/jpeg")).toBe("jpg");
		expect(getImageExtensionFromMimeType("image/vnd.microsoft.icon")).toBe(
			"ico",
		);
		expect(getImageExtensionFromMimeType("image/webp")).toBe("webp");
		expect(getImageExtensionFromMimeType("image/avif")).toBeNull();
	});

	test("parses base64 data URLs with extra MIME parameters", () => {
		expect(
			parseBase64DataUrl(
				`data:image/svg+xml;charset=utf-8;base64,${PNG_BASE64}`,
			),
		).toEqual({
			base64Data: PNG_BASE64,
			mimeType: "image/svg+xml",
		});
	});

	test("rejects malformed base64 data URLs", () => {
		expect(() => parseBase64DataUrl("not-a-data-url")).toThrow(
			"Invalid data URL format",
		);
	});

	test("detects pdf / csv / html by extension (case-insensitive)", () => {
		expect(isPdfFile("doc.PDF")).toBe(true);
		expect(isPdfFile("doc.txt")).toBe(false);
		expect(isCsvFile("data.csv")).toBe(true);
		expect(isCsvFile("data.tsv")).toBe(true);
		expect(isCsvFile("data.json")).toBe(false);
		expect(isHtmlFile("page.html")).toBe(true);
		expect(isHtmlFile("page.htm")).toBe(true);
		expect(isHtmlFile("page.css")).toBe(false);
	});

	test("picks the right csv delimiter", () => {
		expect(getCsvDelimiter("data.csv")).toBe(",");
		expect(getCsvDelimiter("data.tsv")).toBe("\t");
	});

	test("flags only images and pdfs as binary-readable", () => {
		expect(isBinaryReadableFile("logo.png")).toBe(true);
		expect(isBinaryReadableFile("doc.pdf")).toBe(true);
		expect(isBinaryReadableFile("notes.csv")).toBe(false);
		expect(isBinaryReadableFile("page.html")).toBe(false);
		expect(isBinaryReadableFile("readme.md")).toBe(false);
	});

	test("hasRenderedPreview covers all preview formats", () => {
		for (const path of ["a.md", "a.png", "a.pdf", "a.csv", "a.tsv", "a.html"]) {
			expect(hasRenderedPreview(path)).toBe(true);
		}
		expect(hasRenderedPreview("a.ts")).toBe(false);
	});
});
