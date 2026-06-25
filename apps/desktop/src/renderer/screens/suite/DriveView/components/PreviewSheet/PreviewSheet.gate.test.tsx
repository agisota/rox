import { describe, expect, mock, test } from "bun:test";
import { fileKind, isPreviewable } from "../../utils/fileKind";

// The rich renderers import CSS + browser-only libs; mock them so importing
// PreviewSheet for `scanStateMessage` doesn't pull pdf.js / lightbox into the
// Bun test runtime.
mock.module("./ImageLightbox", () => ({ ImageLightbox: () => null }));
mock.module("./PdfViewer", () => ({ PdfViewer: () => null }));

const { scanStateMessage } = await import("./PreviewSheet");

type Status = "pending" | "scanning" | "clean" | "quarantined";

/**
 * PreviewSheet scan-state gate. The sheet computes `previewable = scanMsg ===
 * null && isPreviewable(kind)` and only then requests a presigned URL, mirroring
 * the server gate. These prove that decision directly (the Radix Sheet body is
 * portaled, so a static render of the component yields no markup):
 *
 *   • non-clean files map to an explicit RU scan message → NOT previewable, so
 *     no URL is ever requested, and
 *   • clean image/pdf files clear the gate → routed to the rich renderers.
 */
describe("PreviewSheet scan-state gate", () => {
	const gate = (status: Status, mediaType: string, name: string) => {
		const scanMsg = scanStateMessage(status);
		return {
			scanMsg,
			previewable: scanMsg === null && isPreviewable(fileKind(mediaType, name)),
		};
	};

	test("quarantined → safety message, never previewable", () => {
		const r = gate("quarantined", "image/png", "a.png");
		expect(r.scanMsg).toBe("Файл не прошёл проверку безопасности");
		expect(r.previewable).toBe(false);
	});

	test("pending / scanning → processing message, never previewable", () => {
		for (const s of ["pending", "scanning"] as const) {
			const r = gate(s, "application/pdf", "doc.pdf");
			expect(r.scanMsg).toBe("Файл ещё обрабатывается");
			expect(r.previewable).toBe(false);
		}
	});

	test("clean image clears the gate (routed to lightbox)", () => {
		const r = gate("clean", "image/png", "a.png");
		expect(r.scanMsg).toBeNull();
		expect(r.previewable).toBe(true);
	});

	test("clean pdf clears the gate (routed to paged viewer)", () => {
		const r = gate("clean", "application/pdf", "doc.pdf");
		expect(r.scanMsg).toBeNull();
		expect(r.previewable).toBe(true);
	});

	test("clean unsupported kind stays behind the gate (generic card)", () => {
		const r = gate("clean", "application/zip", "z.zip");
		expect(r.scanMsg).toBeNull();
		expect(r.previewable).toBe(false);
	});
});
