import { describe, expect, it } from "bun:test";
import {
	CANVAS_REF_DRAG_MIME,
	type CanvasRefDragPayload,
	canvasNodeTypeForRef,
	hasCanvasRefDragType,
	readCanvasRefDragData,
	setCanvasRefDragData,
} from "./canvasRefDrag";

/** Minimal `DataTransfer` stand-in; bun's DOM globals omit the real class. */
function createDataTransfer(): DataTransfer {
	const store = new Map<string, string>();
	return {
		setData(type: string, value: string) {
			store.set(type, value);
		},
		getData(type: string) {
			return store.get(type) ?? "";
		},
		get types() {
			return Array.from(store.keys());
		},
		dropEffect: "none",
		effectAllowed: "none",
	} as unknown as DataTransfer;
}

const payload: CanvasRefDragPayload = {
	refType: "note",
	refId: "note-1",
	label: "Заметка дня",
};

describe("canvasRefDrag", () => {
	it("round-trips a payload through setData/readData", () => {
		const dt = createDataTransfer();
		setCanvasRefDragData(dt, payload);
		expect(dt.effectAllowed).toBe("copy");
		expect(dt.getData("text/plain")).toBe("Заметка дня");
		expect(readCanvasRefDragData(dt)).toEqual(payload);
	});

	it("detects the canvas-ref MIME type", () => {
		const dt = createDataTransfer();
		expect(hasCanvasRefDragType(dt)).toBe(false);
		setCanvasRefDragData(dt, payload);
		expect(hasCanvasRefDragType(dt)).toBe(true);
	});

	it("returns null for unrelated drags and malformed payloads", () => {
		expect(readCanvasRefDragData(null)).toBeNull();
		const empty = createDataTransfer();
		expect(readCanvasRefDragData(empty)).toBeNull();
		const bad = createDataTransfer();
		bad.setData(CANVAS_REF_DRAG_MIME, "{not json");
		expect(readCanvasRefDragData(bad)).toBeNull();
		const wrongType = createDataTransfer();
		wrongType.setData(
			CANVAS_REF_DRAG_MIME,
			JSON.stringify({ refType: "project", refId: "p1", label: "x" }),
		);
		expect(readCanvasRefDragData(wrongType)).toBeNull();
	});

	it("maps every drag type to a canvas node type", () => {
		expect(canvasNodeTypeForRef("session")).toBe("chat-session");
		expect(canvasNodeTypeForRef("note")).toBe("note");
		expect(canvasNodeTypeForRef("file")).toBe("file");
		expect(canvasNodeTypeForRef("task")).toBe("task");
	});
});
