import { describe, expect, it } from "bun:test";
import { resolveActiveCanvasId } from "./canvas-active-selection";

describe("resolveActiveCanvasId", () => {
	it("keeps an explicit selected canvas active even before the list refreshes", () => {
		expect(
			resolveActiveCanvasId({
				initialCanvasId: "initial-canvas",
				selectedCanvasId: "imported-canvas",
				canvasIds: ["initial-canvas"],
			}),
		).toBe("imported-canvas");
	});

	it("uses the route-provided initial canvas before falling back to the list", () => {
		expect(
			resolveActiveCanvasId({
				initialCanvasId: "deep-linked-canvas",
				selectedCanvasId: null,
				canvasIds: ["first-listed-canvas"],
			}),
		).toBe("deep-linked-canvas");
	});

	it("falls back to the first listed canvas when no explicit canvas is active", () => {
		expect(
			resolveActiveCanvasId({
				initialCanvasId: null,
				selectedCanvasId: null,
				canvasIds: ["first-listed-canvas", "second-listed-canvas"],
			}),
		).toBe("first-listed-canvas");
	});

	it("returns null when no canvas can be resolved", () => {
		expect(
			resolveActiveCanvasId({
				initialCanvasId: null,
				selectedCanvasId: null,
				canvasIds: [],
			}),
		).toBeNull();
	});
});
