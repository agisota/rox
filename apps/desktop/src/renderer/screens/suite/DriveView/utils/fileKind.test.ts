import { describe, expect, test } from "bun:test";
import { fileKind, isPreviewable } from "./fileKind";

/**
 * fileKind drives both the row icon and the preview renderer branch. These
 * cover the kinds the rich preview routes specially (image → lightbox, pdf →
 * paged viewer) plus the MIME/extension fallbacks they depend on.
 */
describe("fileKind", () => {
	test("classifies images from MIME and extension", () => {
		expect(fileKind("image/png", "a.png")).toBe("image");
		expect(fileKind("image/webp", "a.webp")).toBe("image");
		expect(fileKind("IMAGE/JPEG", "photo.jpg")).toBe("image"); // case-insensitive
	});

	test("classifies PDFs from MIME and extension", () => {
		expect(fileKind("application/pdf", "doc.pdf")).toBe("pdf");
		expect(fileKind("", "report.pdf")).toBe("pdf");
	});

	test("keeps other kinds intact", () => {
		expect(fileKind("video/mp4", "v.mp4")).toBe("video");
		expect(fileKind("audio/mpeg", "a.mp3")).toBe("audio");
		expect(fileKind("text/plain", "n.txt")).toBe("text");
		expect(fileKind("application/json", "p.json")).toBe("code");
		expect(fileKind("application/zip", "z.zip")).toBe("archive");
		expect(fileKind("application/octet-stream", "x.bin")).toBe("other");
	});
});

describe("isPreviewable", () => {
	test("image and pdf are previewable (rich renderers)", () => {
		expect(isPreviewable("image")).toBe(true);
		expect(isPreviewable("pdf")).toBe(true);
	});

	test("inline media + text kinds remain previewable", () => {
		expect(isPreviewable("video")).toBe(true);
		expect(isPreviewable("audio")).toBe(true);
		expect(isPreviewable("text")).toBe(true);
		expect(isPreviewable("code")).toBe(true);
	});

	test("non-renderable kinds fall back to the generic card", () => {
		expect(isPreviewable("archive")).toBe(false);
		expect(isPreviewable("other")).toBe(false);
	});
});
