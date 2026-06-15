import { describe, expect, it } from "bun:test";
import { buildLinearRedirectUri } from "./linear-oauth";

describe("buildLinearRedirectUri", () => {
	it("uses the canonical Linear callback path", () => {
		expect(buildLinearRedirectUri("https://api.rox.one")).toBe(
			"https://api.rox.one/api/integrations/linear/callback",
		);
	});

	it("normalizes trailing slashes from the API base URL", () => {
		expect(buildLinearRedirectUri("https://api.rox.one/")).toBe(
			"https://api.rox.one/api/integrations/linear/callback",
		);
		expect(buildLinearRedirectUri("https://api.rox.one///")).toBe(
			"https://api.rox.one/api/integrations/linear/callback",
		);
	});
});
