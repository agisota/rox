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

	it("fails OPEN (grants + degraded) when PostHog evaluation fails, so an outage does not lock users out", () => {
		// Infra failure must not be a hard deny: a PostHog outage previously
		// returned deny-on-error and locked everyone out. The resilient policy
		// grants access and marks `degraded` so the failed check stays observable.
		const result = resolveAgentsUiAccess(undefined, true);
		expect(result.hasAgentsUiAccess).toBe(true);
		expect(result.degraded).toBe(true);
	});

	it("fails open regardless of the (stale/partial) flag value when evaluation failed", () => {
		// `evaluationFailed` wins over whatever `flagValue` happens to be: even a
		// falsy value during an outage must not deny — the signal is untrusted.
		expect(resolveAgentsUiAccess(false, true)).toEqual({
			hasAgentsUiAccess: true,
			degraded: true,
		});
		expect(resolveAgentsUiAccess(true, true)).toEqual({
			hasAgentsUiAccess: true,
			degraded: true,
		});
	});

	it("keeps a genuine deny (flag explicitly off, evaluation succeeded) working — outage resilience does not weaken the real gate", () => {
		expect(resolveAgentsUiAccess(false, false)).toEqual({
			hasAgentsUiAccess: false,
			degraded: false,
		});
	});
});
