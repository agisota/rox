import { describe, expect, it } from "bun:test";
import {
	emptyCanvasSelection,
	getCanvasCapabilityDisabledReason,
	getCanvasSelectionCount,
	hasCanvasSelection,
	toCanvasCapabilitySelectionInput,
} from "./canvas-capability-selection";

describe("canvas capability selection helpers", () => {
	it("omits empty selection payloads from capability runs", () => {
		const selection = emptyCanvasSelection();

		expect(getCanvasSelectionCount(selection)).toBe(0);
		expect(hasCanvasSelection(selection)).toBe(false);
		expect(toCanvasCapabilitySelectionInput(selection)).toBeUndefined();
	});

	it("creates renderer-neutral selection payloads for selected canvas entities", () => {
		const selection = {
			nodeIds: ["node-a", "node-b"],
			edgeIds: ["edge-a-b"],
			groupIds: ["group-a"],
		};

		expect(getCanvasSelectionCount(selection)).toBe(4);
		expect(hasCanvasSelection(selection)).toBe(true);
		expect(toCanvasCapabilitySelectionInput(selection)).toEqual(selection);
	});

	it("explains why selection-aware capabilities are disabled", () => {
		expect(
			getCanvasCapabilityDisabledReason({
				hasActiveCanvas: true,
				isPending: false,
				requiresSelection: true,
				selection: emptyCanvasSelection(),
			}),
		).toBe(
			"Select one or more Canvas entities before running this capability.",
		);

		expect(
			getCanvasCapabilityDisabledReason({
				hasActiveCanvas: true,
				isPending: false,
				requiresSelection: true,
				selection: {
					nodeIds: ["node-a"],
					edgeIds: [],
					groupIds: [],
				},
			}),
		).toBeUndefined();
	});
});
