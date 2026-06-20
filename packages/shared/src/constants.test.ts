import { describe, expect, it } from "bun:test";
import { FEATURE_FLAGS } from "./constants";

describe("FEATURE_FLAGS", () => {
	it("includes the WS-N network-filter + automation keys", () => {
		expect(FEATURE_FLAGS.NETWORK_FILTER).toBe("network-filter");
		expect(FEATURE_FLAGS.AUTOMATION_ACCESS).toBe("automation-access");
	});

	it("keeps every flag value kebab-case", () => {
		const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
		for (const value of Object.values(FEATURE_FLAGS)) {
			expect(value).toMatch(kebab);
		}
	});

	it("has unique flag values (no key collides on the same PostHog flag)", () => {
		const values = Object.values(FEATURE_FLAGS);
		expect(new Set(values).size).toBe(values.length);
	});
});
