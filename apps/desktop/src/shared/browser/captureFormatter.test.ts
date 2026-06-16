import { describe, expect, it } from "bun:test";
import { formatCaptureForAgent } from "./captureFormatter";
import type { DesignModeCapture } from "./types";

function makeCapture(over: Partial<DesignModeCapture> = {}): DesignModeCapture {
	return {
		id: "abc123",
		workspaceId: "ws1",
		browserSessionId: "pane1",
		url: "http://localhost:3000/",
		title: "My App",
		timestamp: "2026-06-15T00:00:00.000Z",
		selector: { css: "button.primary", xpath: "/body[1]/button[1]" },
		bounds: {
			x: 10,
			y: 20,
			width: 100,
			height: 40,
			viewportWidth: 393,
			viewportHeight: 852,
			deviceScaleFactor: 3,
		},
		html: { outerHTML: "<button class='primary'>Go</button>" },
		styles: { computed: { color: "rgb(0,0,0)", "font-size": "16px" } },
		screenshot: {
			path: "/tmp/x.png",
			data: "QkFTRTY0",
			mimeType: "image/png",
			width: 300,
			height: 120,
		},
		devicePresetId: "iphone-15",
		...over,
	};
}

describe("formatCaptureForAgent", () => {
	it("produces a structured markdown block + screenshot attachment", () => {
		const out = formatCaptureForAgent(makeCapture());
		expect(out.content).toContain("Selected UI element from Rox Design Mode");
		expect(out.content).toContain("URL: http://localhost:3000/");
		expect(out.content).toContain("Viewport: 393×852 @ 3x");
		expect(out.content).toContain("Device: iphone-15");
		expect(out.content).toContain("Selector: button.primary");
		expect(out.content).toContain("```html");
		expect(out.content).toContain("font-size: 16px;");
		expect(out.files).toHaveLength(1);
		expect(out.files[0]).toEqual({
			data: "QkFTRTY0",
			mediaType: "image/png",
			filename: "design-capture-abc123.png",
		});
		expect(out.content).toContain("design-capture-abc123.png (attached)");
	});

	it("renders resolved source with confidence", () => {
		const out = formatCaptureForAgent(
			makeCapture({
				source: {
					filePath: "src/Button.tsx",
					line: 42,
					framework: "react",
					confidence: "high",
				},
			}),
		);
		expect(out.content).toContain("- file: src/Button.tsx");
		expect(out.content).toContain("- line: 42");
		expect(out.content).toContain("- confidence: high");
	});

	it("notes when source is unresolved", () => {
		const out = formatCaptureForAgent(makeCapture({ source: undefined }));
		expect(out.content).toContain("Source: (not resolved)");
	});

	it("references the on-disk path when requested (clipboard hand-off)", () => {
		const out = formatCaptureForAgent(makeCapture(), {
			screenshotRef: "path",
		});
		expect(out.content).toContain("Screenshot: /tmp/x.png");
		expect(out.content).not.toContain("(attached)");
	});

	it("notes an omitted screenshot when the path is empty (over-limit)", () => {
		const out = formatCaptureForAgent(
			makeCapture({
				screenshot: {
					path: "",
					data: "",
					mimeType: "image/png",
					width: 0,
					height: 0,
				},
			}),
			{ screenshotRef: "path" },
		);
		expect(out.content).toContain(
			"Screenshot: (omitted — exceeded size limit)",
		);
		expect(out.files).toHaveLength(0);
	});

	it("notes an omitted screenshot in attachment mode when data is empty", () => {
		const out = formatCaptureForAgent(
			makeCapture({
				screenshot: {
					path: "",
					data: "",
					mimeType: "image/png",
					width: 0,
					height: 0,
				},
			}),
			{ screenshotRef: "attachment" },
		);
		expect(out.content).toContain(
			"Screenshot: (omitted — exceeded size limit)",
		);
		expect(out.content).not.toContain("(attached)");
		expect(out.files).toHaveLength(0);
	});

	it("prepends an optional prompt prefix", () => {
		const out = formatCaptureForAgent(makeCapture(), {
			promptPrefix: "Fix the spacing of this element.",
		});
		expect(out.content.startsWith("Fix the spacing of this element.")).toBe(
			true,
		);
	});
});
