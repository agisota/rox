import { describe, expect, it } from "bun:test";
// CJS module; import the public surface.
import { getPhysFootprints } from "./index.js";

/**
 * These tests cover ONLY the pure, offline input-guard branches of the JS
 * wrapper. They short-circuit and return `{}` before the native addon (which
 * reads live macOS process metrics via proc_pid_rusage) is ever called, so
 * they are deterministic on any platform regardless of whether the native
 * build is present. We deliberately never pass a non-empty PID array, which
 * would touch real system metrics.
 */
describe("getPhysFootprints input guards", () => {
	it("returns an empty object for an empty PID array", () => {
		expect(getPhysFootprints([])).toEqual({});
	});

	it("returns an empty object when given a non-array value", () => {
		// @ts-expect-error - exercising the runtime Array.isArray guard
		expect(getPhysFootprints(undefined)).toEqual({});
		// @ts-expect-error - exercising the runtime Array.isArray guard
		expect(getPhysFootprints(null)).toEqual({});
		// @ts-expect-error - exercising the runtime Array.isArray guard
		expect(getPhysFootprints(123)).toEqual({});
		// @ts-expect-error - exercising the runtime Array.isArray guard
		expect(getPhysFootprints("not-an-array")).toEqual({});
		// @ts-expect-error - exercising the runtime Array.isArray guard
		expect(getPhysFootprints({})).toEqual({});
	});

	it("returns a fresh object instance each call (no shared mutable state)", () => {
		const a = getPhysFootprints([]);
		const b = getPhysFootprints([]);
		expect(a).toEqual({});
		expect(b).toEqual({});
		expect(a).not.toBe(b);
	});
});
