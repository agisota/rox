import { describe, expect, it } from "bun:test";

import {
	ease,
	gestureGrammar,
	motionDuration,
	motionShake,
	motionSpring,
	PANEL_SCENE_VT_NAME,
	panelSceneMotion,
	shakeVariants,
	shellBootVariants,
} from "./tokens";

/**
 * Regression guard for the FROZEN, append-only motion-token lane
 * (`packages/ui/src/motion/tokens.ts:6-9`). New cases may APPEND tokens, but the
 * keys asserted here must never be removed or repurposed — every animated case
 * and the `@rox/collab`/`@rox/rtc` presence UI depend on them by name. If a key
 * below disappears, this test fails before the change can merge.
 */
describe("motion token contract (append-only lane)", () => {
	it("keeps the duration tokens", () => {
		expect(motionDuration.fast).toBe(0.12);
		expect(motionDuration.base).toBe(0.2);
		expect(motionDuration.slow).toBe(0.32);
	});

	it("keeps every named spring preset", () => {
		const required = [
			"soft",
			"snappy",
			"panel",
			"pop",
			"sidebarCollapse",
			"layout",
			"gentle",
			"badge",
			"bouncy",
		] as const;
		for (const key of required) {
			expect(motionSpring[key]).toBeDefined();
			expect(motionSpring[key].type).toBe("spring");
		}
	});

	it("keeps the easing curves as cubic-bezier tuples", () => {
		expect(ease.standard).toEqual([0.2, 0, 0, 1]);
		expect(ease.emphasized).toEqual([0.3, 0, 0, 1]);
	});

	it("keeps the shared variant sets", () => {
		expect(shellBootVariants.container).toBeDefined();
		expect(shellBootVariants.column).toBeDefined();
		expect(shellBootVariants.sidebar).toBeDefined();
		expect(shakeVariants.rest).toBeDefined();
		expect(shakeVariants.shake).toBeDefined();
		expect(Array.isArray(motionShake.x)).toBe(true);
	});

	it("keeps the panel-scene tokens (case 054)", () => {
		expect(panelSceneMotion.enterOffset).toBeGreaterThan(0);
		expect(panelSceneMotion.exitOffset).toBeGreaterThan(0);
		expect(panelSceneMotion.replaceFade).toBeGreaterThan(0);
		expect(panelSceneMotion.replaceFade).toBeLessThan(1);
		// Reuses the panel spring so the morph matches sidebar/zen geometry.
		expect(panelSceneMotion.spring).toBe(motionSpring.panel);
		expect(PANEL_SCENE_VT_NAME).toBe("rox-panel-scene");
	});

	it("keeps the gesture-grammar thresholds (case 051)", () => {
		// Swipe-to-commit: preview reveals before commit fires.
		expect(gestureGrammar.swipe.previewThreshold).toBeLessThan(
			gestureGrammar.swipe.commitThreshold,
		);
		expect(gestureGrammar.swipe.velocityCommit).toBeGreaterThan(0);
		expect(gestureGrammar.swipe.quickTagChipWidth).toBeGreaterThan(0);
		// Pan-resize: collapse below min, min below max, snap window positive.
		expect(gestureGrammar.panResize.minSize).toBeLessThan(
			gestureGrammar.panResize.maxSize,
		);
		expect(gestureGrammar.panResize.collapseThreshold).toBeGreaterThan(0);
		expect(gestureGrammar.panResize.snapThreshold).toBeGreaterThan(0);
		// Edge-swipe + long-press timings.
		expect(gestureGrammar.edgeSwipe.edgeWidth).toBeGreaterThan(0);
		expect(gestureGrammar.edgeSwipe.openThreshold).toBeGreaterThan(0);
		expect(gestureGrammar.longPress.duration).toBeGreaterThan(0);
		expect(gestureGrammar.longPress.moveTolerance).toBeGreaterThan(0);
	});
});
