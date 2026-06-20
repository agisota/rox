import { describe, expect, test } from "bun:test";
import { DEFAULT_SPAM_THRESHOLD, scoreInboundSpam } from "./spamScore";

describe("scoreInboundSpam", () => {
	test("clean mail (all auth pass) scores 0 and is not quarantined", () => {
		const r = scoreInboundSpam({
			auth: { spf: true, dkim: true, dmarc: true },
			subject: "Lunch?",
			snippet: "Are you free tomorrow",
		});
		expect(r.score).toBe(0);
		expect(r.quarantined).toBe(false);
	});

	test("DMARC fail dominates and quarantines", () => {
		const r = scoreInboundSpam({
			auth: { spf: false, dkim: false, dmarc: false },
			subject: "hi",
		});
		expect(r.score).toBeGreaterThanOrEqual(DEFAULT_SPAM_THRESHOLD);
		expect(r.quarantined).toBe(true);
		expect(r.reasons).toContain("dmarc_fail");
	});

	test("spammy content nudges the score", () => {
		const clean = scoreInboundSpam({
			auth: { spf: true, dkim: true, dmarc: true },
			subject: "normal",
		});
		const spammy = scoreInboundSpam({
			auth: { spf: true, dkim: true, dmarc: true },
			subject: "Free money click here now",
		});
		expect(spammy.score).toBeGreaterThan(clean.score);
		expect(spammy.reasons).toContain("spammy_content");
	});

	test("unknown auth is treated more suspiciously than passing", () => {
		const unknown = scoreInboundSpam({
			auth: { spf: null, dkim: null, dmarc: null },
		});
		expect(unknown.score).toBeGreaterThan(0);
		expect(unknown.reasons).toContain("dmarc_unknown");
	});

	test("bulk recipient blasts add a penalty", () => {
		const r = scoreInboundSpam({
			auth: { spf: true, dkim: true, dmarc: true },
			recipientCount: 50,
		});
		expect(r.reasons).toContain("bulk_recipients");
	});

	test("score is clamped to 0..100", () => {
		const r = scoreInboundSpam({
			auth: { spf: false, dkim: false, dmarc: false },
			subject: "Free money win $1000 viagra",
			recipientCount: 100,
		});
		expect(r.score).toBeLessThanOrEqual(100);
		expect(r.score).toBeGreaterThanOrEqual(0);
	});
});
