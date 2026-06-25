import { describe, expect, it } from "bun:test";
import {
	APPEARANCE_STORAGE_KEY,
	BACKDROP_BLUR_PX,
	BACKDROP_BLUR_VAR,
	buildBfcacheResyncScript,
	buildFirstPaintScript,
	GLASS_ROOT_CLASS,
	SURFACE_OPACITY_VAR,
} from "./first-paint";

/** Minimal DOM root double recording class + style-var mutations. */
function makeRoot() {
	const classes = new Set<string>();
	const vars = new Map<string, string>();
	return {
		classList: {
			add: (c: string) => classes.add(c),
			remove: (c: string) => classes.delete(c),
			has: (c: string) => classes.has(c),
		},
		style: {
			setProperty: (k: string, v: string) => vars.set(k, v),
			removeProperty: (k: string) => vars.delete(k),
			get: (k: string) => vars.get(k),
		},
	};
}

/**
 * Evaluate a first-paint script body against a fake `localStorage` + a fake
 * `document.documentElement`, returning the recording root. Mirrors how the
 * browser runs the blocking `<head>` script, without a real DOM.
 */
function runFirstPaint(stored: string | null) {
	const root = makeRoot();
	const localStorage = { getItem: (_k: string) => stored };
	const document = { documentElement: root };
	// The script references global `localStorage`, `document`, `Math`, `isFinite`,
	// `JSON`, `String` — inject the first two, the rest come from the Function env.
	new Function("localStorage", "document", buildFirstPaintScript())(
		localStorage,
		document,
	);
	return root;
}

describe("buildFirstPaintScript", () => {
	it("stamps glass class + clamped opacity + blur when glass is enabled", () => {
		const root = runFirstPaint(
			JSON.stringify({ glassEnabled: true, windowOpacity: 0.6 }),
		);
		expect(root.classList.has(GLASS_ROOT_CLASS)).toBe(true);
		expect(root.style.get(SURFACE_OPACITY_VAR)).toBe("0.6");
		expect(root.style.get(BACKDROP_BLUR_VAR)).toBe(`${BACKDROP_BLUR_PX}px`);
	});

	it("clamps opacity into the 0.2–1 range", () => {
		expect(
			runFirstPaint(
				JSON.stringify({ glassEnabled: true, windowOpacity: 5 }),
			).style.get(SURFACE_OPACITY_VAR),
		).toBe("1");
		expect(
			runFirstPaint(
				JSON.stringify({ glassEnabled: true, windowOpacity: -3 }),
			).style.get(SURFACE_OPACITY_VAR),
		).toBe("0.2");
	});

	it("defaults opacity to opaque when the stored value is not finite", () => {
		expect(
			runFirstPaint(
				JSON.stringify({ glassEnabled: true, windowOpacity: "nope" }),
			).style.get(SURFACE_OPACITY_VAR),
		).toBe("1");
	});

	it("removes the glass stamp when glass is disabled", () => {
		const root = runFirstPaint(JSON.stringify({ glassEnabled: false }));
		expect(root.classList.has(GLASS_ROOT_CLASS)).toBe(false);
		expect(root.style.get(SURFACE_OPACITY_VAR)).toBeUndefined();
		expect(root.style.get(BACKDROP_BLUR_VAR)).toBeUndefined();
	});

	it("no-ops when nothing is persisted", () => {
		const root = runFirstPaint(null);
		expect(root.classList.has(GLASS_ROOT_CLASS)).toBe(false);
		expect(root.style.get(SURFACE_OPACITY_VAR)).toBeUndefined();
	});

	it("swallows malformed JSON without throwing", () => {
		expect(() => runFirstPaint("{not json")).not.toThrow();
	});

	it("is idempotent — re-running yields the same stamp", () => {
		const blob = JSON.stringify({ glassEnabled: true, windowOpacity: 0.6 });
		const root = makeRoot();
		const document = { documentElement: root };
		const localStorage = { getItem: () => blob };
		const fn = new Function(
			"localStorage",
			"document",
			buildFirstPaintScript(),
		);
		fn(localStorage, document);
		fn(localStorage, document);
		expect(root.classList.has(GLASS_ROOT_CLASS)).toBe(true);
		expect(root.style.get(SURFACE_OPACITY_VAR)).toBe("0.6");
	});

	it("reads the shared appearance storage key", () => {
		expect(buildFirstPaintScript()).toContain(
			JSON.stringify(APPEARANCE_STORAGE_KEY),
		);
	});
});

describe("buildBfcacheResyncScript", () => {
	it("guards on event.persisted and listens for pageshow", () => {
		const script = buildBfcacheResyncScript();
		expect(script).toContain('addEventListener("pageshow"');
		expect(script).toContain("e.persisted");
	});

	it("re-runs the first-paint stamp on a bfcache restore", () => {
		const blob = JSON.stringify({ glassEnabled: true, windowOpacity: 0.6 });
		const root = makeRoot();
		// Capture into an array so TS does not narrow the handler back to `null`
		// (the registration runs indirectly through `new Function`, invisible to
		// control-flow analysis).
		const handlers: Array<(e: { persisted: boolean }) => void> = [];
		const window = {
			addEventListener: (
				_type: string,
				fn: (e: { persisted: boolean }) => void,
			) => {
				handlers.push(fn);
			},
		};
		new Function(
			"window",
			"localStorage",
			"document",
			buildBfcacheResyncScript(),
		)(window, { getItem: () => blob }, { documentElement: root });
		const handler = handlers[0];
		expect(handler).toBeDefined();

		// A non-bfcache navigation must not re-stamp.
		handler?.({ persisted: false });
		expect(root.classList.has(GLASS_ROOT_CLASS)).toBe(false);

		// A bfcache restore re-applies the stamp.
		handler?.({ persisted: true });
		expect(root.classList.has(GLASS_ROOT_CLASS)).toBe(true);
		expect(root.style.get(SURFACE_OPACITY_VAR)).toBe("0.6");
	});
});
