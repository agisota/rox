import { describe, expect, it } from "bun:test";
import { canvasNodeTypeSchema } from "@rox/shared/canvas";
import {
	canvasNodeTypes,
	getCanvasNodeMeta,
	getCanvasNodeTypeLabel,
} from "./canvasNodeMeta";

describe("canvasNodeMeta", () => {
	it("covers every canvas node type from the shared schema", () => {
		const schemaTypes = canvasNodeTypeSchema.options;
		for (const type of schemaTypes) {
			const meta = getCanvasNodeMeta(type);
			expect(meta.label.length).toBeGreaterThan(0);
			// lucide icons are memo/forwardRef components (typeof "object").
			expect(meta.icon).toBeDefined();
			expect(meta.accent.length).toBeGreaterThan(0);
		}
		expect(canvasNodeTypes.length).toBe(schemaTypes.length);
	});

	it("returns a Russian label for known types", () => {
		expect(getCanvasNodeTypeLabel("chat-session")).toBe("Сессия");
		expect(getCanvasNodeTypeLabel("task")).toBe("Задача");
		expect(getCanvasNodeTypeLabel("note")).toBe("Заметка");
	});
});
