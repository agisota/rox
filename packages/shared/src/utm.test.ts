import { describe, expect, it } from "bun:test";
import { hasUtm, parseUtmParams, utmToAnalyticsTraits } from "./utm";

describe("parseUtmParams", () => {
	it("extracts utm parameters from a query string", () => {
		expect(parseUtmParams("?utm_source=google&utm_medium=cpc")).toEqual({
			utmSource: "google",
			utmMedium: "cpc",
		});
	});

	it("extracts utm parameters from a full URL, ignoring non-utm params", () => {
		expect(
			parseUtmParams("https://rox.one/pricing?utm_campaign=launch&x=1"),
		).toEqual({ utmCampaign: "launch" });
	});

	it("accepts a bare key=value query without a leading '?' and url-decodes", () => {
		expect(parseUtmParams("utm_term=ai%20agents")).toEqual({
			utmTerm: "ai agents",
		});
	});

	it("accepts a URLSearchParams instance", () => {
		const sp = new URLSearchParams({ utm_content: "hero-cta" });
		expect(parseUtmParams(sp)).toEqual({ utmContent: "hero-cta" });
	});

	it("trims whitespace and drops blank values", () => {
		expect(parseUtmParams("?utm_source=%20%20&utm_medium=%20email%20")).toEqual(
			{ utmMedium: "email" },
		);
	});

	it("caps very long values to 256 characters", () => {
		const long = "a".repeat(500);
		expect(parseUtmParams(`?utm_campaign=${long}`).utmCampaign?.length).toBe(
			256,
		);
	});

	it("returns an empty object when there are no utm params", () => {
		expect(parseUtmParams("https://rox.one/?ref=hn")).toEqual({});
		expect(parseUtmParams("")).toEqual({});
	});
});

describe("hasUtm", () => {
	it("is true when any utm field is present", () => {
		expect(hasUtm({ utmSource: "x" })).toBe(true);
	});

	it("is false for an empty params object", () => {
		expect(hasUtm({})).toBe(false);
	});
});

describe("utmToAnalyticsTraits", () => {
	it("maps present fields to snake_case trait keys", () => {
		expect(
			utmToAnalyticsTraits({ utmSource: "google", utmCampaign: "launch" }),
		).toEqual({ utm_source: "google", utm_campaign: "launch" });
	});

	it("omits absent fields", () => {
		expect(utmToAnalyticsTraits({})).toEqual({});
	});
});
