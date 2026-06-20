import { describe, expect, it } from "bun:test";
import { resolveAgentsUiAccess } from "./resolveAgentsUiAccess";

describe("resolveAgentsUiAccess", () => {
	it("grants access when the flag is truthy", () => {
		expect(resolveAgentsUiAccess(true, false)).toEqual({
			hasAgentsUiAccess: true,
			degraded: false,
		});
		expect(resolveAgentsUiAccess("variant-a", false)).toEqual({
			hasAgentsUiAccess: true,
			degraded: false,
		});
	});

	it("denies access when the flag is falsy but evaluation succeeded", () => {
		expect(resolveAgentsUiAccess(false, false)).toEqual({
			hasAgentsUiAccess: false,
			degraded: false,
		});
		expect(resolveAgentsUiAccess(undefined, false)).toEqual({
			hasAgentsUiAccess: false,
			degraded: false,
		});
	});

	it("flags degraded (not a silent deny) when PostHog evaluation fails", () => {
		const result = resolveAgentsUiAccess(undefined, true);
		expect(result.hasAgentsUiAccess).toBe(false);
		expect(result.degraded).toBe(true);
	});
});
