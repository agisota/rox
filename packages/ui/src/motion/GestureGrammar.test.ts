import { describe, expect, it } from "bun:test";

import {
	gestureFollowThrough,
	isEdgeSwipeStart,
	longPressConfig,
	longPressHolds,
	resolveEdgeSwipe,
	resolvePanResize,
	resolveSwipe,
} from "./GestureGrammar";
import { gestureGrammar } from "./tokens";

/**
 * Behaviour contract for the shared gesture grammar (case 051 / #646). The same
 * resolvers back web drawers (F05), desktop pane resize and RN list gestures, so
 * a single token source must drive every commit decision — no per-platform
 * magic numbers — and the two-stage swipe must expose quick-tag chip targets.
 */
describe("gesture grammar — swipe-to-commit two-stage", () => {
	it("stays idle below the preview threshold", () => {
		const r = resolveSwipe({ dx: 10, vx: 0 });
		expect(r.stage).toBe("idle");
		expect(r.willCommit).toBe(false);
	});

	it("reveals the affordance at the preview threshold", () => {
		const r = resolveSwipe({
			dx: gestureGrammar.swipe.previewThreshold,
			vx: 0,
		});
		expect(r.stage).toBe("preview");
		expect(r.willCommit).toBe(false);
	});

	it("commits past the commit threshold", () => {
		const r = resolveSwipe({
			dx: gestureGrammar.swipe.commitThreshold + 1,
			vx: 0,
		});
		expect(r.stage).toBe("commit");
		expect(r.willCommit).toBe(true);
	});

	it("commits on a fast fling regardless of distance", () => {
		const r = resolveSwipe({ dx: 20, vx: gestureGrammar.swipe.velocityCommit });
		expect(r.willCommit).toBe(true);
	});

	it("encodes direction from the pan sign", () => {
		expect(resolveSwipe({ dx: -80, vx: 0 }).direction).toBe("leading");
		expect(resolveSwipe({ dx: 80, vx: 0 }).direction).toBe("trailing");
	});

	it("exposes quick-tag chip targets at stage two", () => {
		const r = resolveSwipe(
			{ dx: gestureGrammar.swipe.commitThreshold + 1, vx: 0 },
			{
				chipCount: 3,
			},
		);
		expect(r.chipTargets).toHaveLength(3);
		expect(r.chipTargets[0]).toEqual({
			start: 0,
			end: gestureGrammar.swipe.quickTagChipWidth,
		});
		expect(r.chipTargets[2]?.end).toBe(
			gestureGrammar.swipe.quickTagChipWidth * 3,
		);
	});

	it("hides chip targets before commit", () => {
		const r = resolveSwipe(
			{ dx: gestureGrammar.swipe.previewThreshold, vx: 0 },
			{
				chipCount: 3,
			},
		);
		expect(r.chipTargets).toHaveLength(0);
	});
});

describe("gesture grammar — pan-resize", () => {
	it("clamps to the min/max bounds", () => {
		expect(resolvePanResize(9999).size).toBe(gestureGrammar.panResize.maxSize);
		expect(resolvePanResize(gestureGrammar.panResize.minSize + 5).size).toBe(
			gestureGrammar.panResize.minSize + 5,
		);
	});

	it("collapses below the collapse threshold", () => {
		const r = resolvePanResize(gestureGrammar.panResize.collapseThreshold - 1);
		expect(r.collapsed).toBe(true);
		expect(r.size).toBe(gestureGrammar.panResize.minSize);
	});

	it("snaps to a nearby rail", () => {
		const rail = 300;
		const r = resolvePanResize(
			rail + gestureGrammar.panResize.snapThreshold - 1,
			{
				snapRails: [rail],
			},
		);
		expect(r.snappedTo).toBe(rail);
		expect(r.size).toBe(rail);
	});

	it("does not snap to a distant rail", () => {
		const r = resolvePanResize(300, { snapRails: [500] });
		expect(r.snappedTo).toBeNull();
		expect(r.size).toBe(300);
	});
});

describe("gesture grammar — edge-swipe", () => {
	it("starts only inside the edge hot zone", () => {
		expect(isEdgeSwipeStart(0)).toBe(true);
		expect(isEdgeSwipeStart(gestureGrammar.edgeSwipe.edgeWidth)).toBe(true);
		expect(isEdgeSwipeStart(gestureGrammar.edgeSwipe.edgeWidth + 1)).toBe(
			false,
		);
	});

	it("reports progress and the open decision", () => {
		const mid = resolveEdgeSwipe(gestureGrammar.edgeSwipe.openThreshold / 2);
		expect(mid.progress).toBeCloseTo(0.5);
		expect(mid.willOpen).toBe(false);

		const open = resolveEdgeSwipe(gestureGrammar.edgeSwipe.openThreshold);
		expect(open.progress).toBe(1);
		expect(open.willOpen).toBe(true);
	});
});

describe("gesture grammar — long-press", () => {
	it("exposes the shared timing", () => {
		const c = longPressConfig();
		expect(c.durationMs).toBe(gestureGrammar.longPress.duration);
		expect(c.moveTolerancePx).toBe(gestureGrammar.longPress.moveTolerance);
	});

	it("cancels when drift exceeds tolerance", () => {
		expect(longPressHolds(gestureGrammar.longPress.moveTolerance)).toBe(true);
		expect(longPressHolds(gestureGrammar.longPress.moveTolerance + 1)).toBe(
			false,
		);
	});
});

describe("gesture grammar — energy contract", () => {
	it("springs only under full energy, snaps under reduced/off", () => {
		expect(gestureFollowThrough(true)).toBe("spring");
		expect(gestureFollowThrough(false)).toBe("snap");
		expect(gestureFollowThrough("full")).toBe("spring");
		expect(gestureFollowThrough("essential")).toBe("snap");
		expect(gestureFollowThrough("off")).toBe("snap");
	});
});
