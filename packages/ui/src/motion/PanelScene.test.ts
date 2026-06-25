import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
	closePanelScene,
	openPanelScene,
	panelSceneSlide,
	panelSceneTransition,
	panelSceneVariants,
	panelSceneViewTransitionName,
	replacePanelScene,
	runPanelSceneTransition,
	supportsViewTransitions,
} from "./PanelScene";
import { motionSpring, PANEL_SCENE_VT_NAME, panelSceneMotion } from "./tokens";
import { setMotionPreferenceSource } from "./useMotionPreference";

/**
 * Behavior + contract guard for the platform-neutral `PanelScene` descriptor
 * and its per-surface mappers (case 054 / PR-54, #648). The descriptor is the
 * single source of truth for the right-panel open/close/replace scenes, so
 * these tests pin its shape, the web VT path's reduced-motion / no-API fallback,
 * and the desktop/mobile mapper outputs.
 */

/**
 * Build a stub `document` exposing a `startViewTransition` that satisfies the
 * DOM `ViewTransition` shape, so tests can drive the web path without a real
 * browser. `onStart` records that the API was reached and optionally runs the
 * swap callback the production code passes in.
 */
function stubViewTransitionDocument(
	onStart: (callback: () => void) => void,
): Document {
	const viewTransition: ViewTransition = {
		finished: Promise.resolve(),
		ready: Promise.resolve(),
		updateCallbackDone: Promise.resolve(),
		skipTransition: () => {},
		types: new Set<string>() as unknown as ViewTransitionTypeSet,
	};
	return {
		startViewTransition: (
			callback?: ViewTransitionUpdateCallback | StartViewTransitionOptions,
		) => {
			const update =
				typeof callback === "function" ? callback : callback?.update;
			onStart(() => {
				if (update) void update();
			});
			return viewTransition;
		},
	} as unknown as Document;
}

describe("PanelScene descriptor", () => {
	it("constructs open/close scenes carrying the panel id", () => {
		expect(openPanelScene("inspector")).toEqual({
			kind: "open",
			panelId: "inspector",
		});
		expect(closePanelScene("inspector")).toEqual({
			kind: "close",
			panelId: "inspector",
		});
	});

	it("constructs a replace scene with both endpoints", () => {
		expect(replacePanelScene("diff", "inspector")).toEqual({
			kind: "replace",
			panelId: "diff",
			fromId: "inspector",
		});
	});

	it("namespaces the view-transition-name by panel identity", () => {
		expect(panelSceneViewTransitionName(openPanelScene("inspector"))).toBe(
			`${PANEL_SCENE_VT_NAME}-inspector`,
		);
		// replace falls back to the outgoing id when no incoming id is given.
		expect(
			panelSceneViewTransitionName(replacePanelScene(undefined, "a")),
		).toBe(`${PANEL_SCENE_VT_NAME}-a`);
		// no identity → the bare namespace.
		expect(panelSceneViewTransitionName(openPanelScene())).toBe(
			PANEL_SCENE_VT_NAME,
		);
	});
});

describe("panelSceneVariants (AnimatePresence fallback)", () => {
	it("enters from the trailing edge and exits back out", () => {
		const v = panelSceneVariants(openPanelScene());
		expect(v.initial).toEqual({ x: panelSceneMotion.enterOffset, opacity: 0 });
		expect(v.animate).toEqual({
			x: 0,
			opacity: 1,
			transition: panelSceneMotion.spring,
		});
		expect(v.exit).toEqual({
			x: panelSceneMotion.exitOffset,
			opacity: 0,
			transition: panelSceneMotion.spring,
		});
	});

	it("cross-dims on replace instead of starting fully transparent", () => {
		const v = panelSceneVariants(replacePanelScene("b", "a"));
		expect(v.initial.opacity).toBe(panelSceneMotion.replaceFade);
	});

	it("drives the morph with the panel spring", () => {
		expect(panelSceneTransition(openPanelScene())).toBe(motionSpring.panel);
	});
});

describe("panelSceneSlide (mobile RN mapping)", () => {
	it("slides in from the edge on open", () => {
		const s = panelSceneSlide(openPanelScene());
		expect(s.from).toEqual({
			translateX: panelSceneMotion.enterOffset,
			opacity: 0,
		});
		expect(s.to).toEqual({ translateX: 0, opacity: 1 });
	});

	it("slides out to the edge on close", () => {
		const s = panelSceneSlide(closePanelScene());
		expect(s.from).toEqual({ translateX: 0, opacity: 1 });
		expect(s.to).toEqual({
			translateX: panelSceneMotion.exitOffset,
			opacity: 0,
		});
	});

	it("cross-dims on replace", () => {
		const s = panelSceneSlide(replacePanelScene());
		expect(s.from.opacity).toBe(panelSceneMotion.replaceFade);
		expect(s.to).toEqual({ translateX: 0, opacity: 1 });
	});
});

describe("supportsViewTransitions", () => {
	const originalDocument = globalThis.document;

	afterEach(() => {
		if (originalDocument === undefined) {
			// @ts-expect-error restore the missing global in a non-DOM env
			delete globalThis.document;
		} else {
			globalThis.document = originalDocument;
		}
	});

	it("is false without a startViewTransition-capable document", () => {
		// @ts-expect-error simulate a non-DOM / unsupported environment
		globalThis.document = {};
		expect(supportsViewTransitions()).toBe(false);
	});

	it("is true when the API is present", () => {
		// @ts-expect-error minimal stub for the capability probe
		globalThis.document = { startViewTransition: () => ({}) };
		expect(supportsViewTransitions()).toBe(true);
	});
});

describe("runPanelSceneTransition", () => {
	const originalDocument = globalThis.document;

	beforeEach(() => {
		// Default to "full" motion so the gate does not short-circuit.
		setMotionPreferenceSource({
			getSnapshot: () => "full",
			subscribe: () => () => {},
		});
	});

	afterEach(() => {
		if (originalDocument === undefined) {
			// @ts-expect-error restore the missing global in a non-DOM env
			delete globalThis.document;
		} else {
			globalThis.document = originalDocument;
		}
		setMotionPreferenceSource({
			getSnapshot: () => "full",
			subscribe: () => () => {},
		});
	});

	it("applies instantly without the VT API", async () => {
		// @ts-expect-error no startViewTransition → fallback path
		globalThis.document = {};
		let applied = false;
		await runPanelSceneTransition(openPanelScene(), () => {
			applied = true;
		});
		expect(applied).toBe(true);
	});

	it("applies instantly when motion is disabled, even with the VT API", async () => {
		let started = false;
		globalThis.document = stubViewTransitionDocument(() => {
			started = true;
		});
		let applied = false;
		await runPanelSceneTransition(
			openPanelScene(),
			() => {
				applied = true;
			},
			{ animate: false },
		);
		expect(applied).toBe(true);
		expect(started).toBe(false);
	});

	it("wraps the swap in startViewTransition when supported + animated", async () => {
		let wrapped = false;
		globalThis.document = stubViewTransitionDocument((cb) => {
			wrapped = true;
			cb();
		});
		let applied = false;
		await runPanelSceneTransition(
			openPanelScene("inspector"),
			() => {
				applied = true;
			},
			{ animate: true },
		);
		expect(wrapped).toBe(true);
		expect(applied).toBe(true);
	});
});
