import { describe, expect, it } from "bun:test";
import {
	ATTRIBUTION_COOKIE_NAME,
	buildAttributionCookieValue,
	parseAttributionCookieValue,
	parseCookieHeader,
} from "./attribution";

describe("attribution cookie", () => {
	it("round-trips utm + landing + referrer through build/parse", () => {
		const value = buildAttributionCookieValue({
			utm: { utmSource: "google", utmCampaign: "launch" },
			landingPage: "/pricing",
			referrer: "https://news.ycombinator.com/",
		});
		expect(parseAttributionCookieValue(value)).toEqual({
			utm: { utmSource: "google", utmCampaign: "launch" },
			landingPage: "/pricing",
			referrer: "https://news.ycombinator.com/",
		});
	});

	it("omits absent fields", () => {
		const value = buildAttributionCookieValue({ utm: { utmSource: "x" } });
		expect(parseAttributionCookieValue(value)).toEqual({
			utm: { utmSource: "x" },
		});
	});

	it("returns null for missing, blank, or non-object values", () => {
		expect(parseAttributionCookieValue(undefined)).toBeNull();
		expect(parseAttributionCookieValue("")).toBeNull();
		expect(parseAttributionCookieValue("not json")).toBeNull();
		expect(parseAttributionCookieValue("[1,2,3]")).toBeNull();
	});

	it("tolerates url-encoded cookie values", () => {
		const raw = buildAttributionCookieValue({ utm: { utmSource: "a b" } });
		expect(parseAttributionCookieValue(encodeURIComponent(raw))).toEqual({
			utm: { utmSource: "a b" },
		});
	});

	it("extracts a named cookie from a Cookie header", () => {
		const header = `foo=1; ${ATTRIBUTION_COOKIE_NAME}=hello%20world; bar=2`;
		expect(parseCookieHeader(header, ATTRIBUTION_COOKIE_NAME)).toBe(
			"hello%20world",
		);
	});

	it("returns undefined when the cookie is absent or the header is empty", () => {
		expect(parseCookieHeader("foo=1", ATTRIBUTION_COOKIE_NAME)).toBeUndefined();
		expect(
			parseCookieHeader(undefined, ATTRIBUTION_COOKIE_NAME),
		).toBeUndefined();
	});
});
