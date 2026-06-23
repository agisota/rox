import { describe, expect, test } from "bun:test";
import { DEFAULT_SPAM_THRESHOLD, scoreInboundSpam } from "./spamScore";

describe("scoreInboundSpam", () => {
	test("genuinely trusted all-pass scores 0 and is not quarantined", () => {
		const r = scoreInboundSpam({
			auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: true },
			subject: "Lunch?",
			snippet: "Are you free tomorrow",
		});
		expect(r.score).toBe(0);
		expect(r.quarantined).toBe(false);
	});

	test("forged-but-untrusted all-pass is still scored (treated as unknown)", () => {
		// A sender can stamp `Authentication-Results: ...; dmarc=pass` on their own
		// message. Without a trusted authserv-id this MUST NOT zero the score.
		const r = scoreInboundSpam({
			auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: false },
			subject: "totally legit",
		});
		expect(r.score).toBeGreaterThan(0);
		expect(r.reasons).toContain("auth_untrusted");
		// Each forged "pass" degrades to an unknown penalty.
		expect(r.reasons).toContain("dmarc_unknown");
		expect(r.reasons).toContain("spf_unknown");
		expect(r.reasons).toContain("dkim_unknown");
	});

	test("a lone trusted dmarc=pass does NOT rescue failing SPF/DKIM", () => {
		const r = scoreInboundSpam({
			auth: { spf: "fail", dkim: "fail", dmarc: "pass", trusted: true },
			subject: "hi",
		});
		// 20 (spf_fail) + 20 (dkim_fail) = 40 — dmarc pass grants no negative weight.
		expect(r.score).toBe(40);
		expect(r.reasons).toContain("spf_fail");
		expect(r.reasons).toContain("dkim_fail");
		expect(r.reasons).not.toContain("dmarc_fail");
	});

	test("trusted DMARC fail dominates and quarantines", () => {
		const r = scoreInboundSpam({
			auth: { spf: "fail", dkim: "fail", dmarc: "fail", trusted: true },
			subject: "hi",
		});
		expect(r.score).toBeGreaterThanOrEqual(DEFAULT_SPAM_THRESHOLD);
		expect(r.quarantined).toBe(true);
		expect(r.reasons).toContain("dmarc_fail");
	});

	test("all-unknown (no trusted verdict present) is suspicious, not clean", () => {
		const r = scoreInboundSpam({
			auth: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
		});
		expect(r.score).toBeGreaterThan(0);
		expect(r.reasons).toContain("dmarc_unknown");
		expect(r.reasons).toContain("auth_untrusted");
	});

	test("spammy content nudges the score above a clean trusted baseline", () => {
		const clean = scoreInboundSpam({
			auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: true },
			subject: "normal",
		});
		const spammy = scoreInboundSpam({
			auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: true },
			subject: "Free money click here now",
		});
		expect(spammy.score).toBeGreaterThan(clean.score);
		expect(spammy.reasons).toContain("spammy_content");
	});

	test("bulk recipient blasts add a penalty", () => {
		const r = scoreInboundSpam({
			auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: true },
			recipientCount: 50,
		});
		expect(r.reasons).toContain("bulk_recipients");
	});

	test("back-compat boolean inputs normalize (true=pass, false=fail, null=unknown)", () => {
		const trustedClean = scoreInboundSpam({
			auth: { spf: true, dkim: true, dmarc: true, trusted: true },
		});
		expect(trustedClean.score).toBe(0);
		const failing = scoreInboundSpam({
			auth: { spf: false, dkim: false, dmarc: false, trusted: true },
		});
		expect(failing.score).toBeGreaterThanOrEqual(DEFAULT_SPAM_THRESHOLD);
		const nullish = scoreInboundSpam({
			auth: { spf: null, dkim: null, dmarc: null },
		});
		expect(nullish.reasons).toContain("dmarc_unknown");
	});

	test("score is clamped to 0..100", () => {
		const r = scoreInboundSpam({
			auth: { spf: "fail", dkim: "fail", dmarc: "fail", trusted: true },
			subject: "Free money win $1000 viagra",
			recipientCount: 100,
		});
		expect(r.score).toBeLessThanOrEqual(100);
		expect(r.score).toBeGreaterThanOrEqual(0);
	});
});
