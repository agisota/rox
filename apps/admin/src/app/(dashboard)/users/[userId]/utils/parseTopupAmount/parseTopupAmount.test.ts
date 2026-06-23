import { describe, expect, test } from "bun:test";

import { parseTopupAmount } from "./parseTopupAmount";

describe("parseTopupAmount (T7)", () => {
	test("accepts a positive number", () => {
		const res = parseTopupAmount("500");
		expect(res).toEqual({ ok: true, rox: 500 });
	});

	test("accepts a decimal", () => {
		const res = parseTopupAmount(" 12.5 ");
		expect(res).toEqual({ ok: true, rox: 12.5 });
	});

	test("rejects empty input", () => {
		const res = parseTopupAmount("   ");
		expect(res.ok).toBe(false);
	});

	test("rejects non-numeric input", () => {
		const res = parseTopupAmount("abc");
		expect(res.ok).toBe(false);
	});

	test("rejects zero and negatives", () => {
		expect(parseTopupAmount("0").ok).toBe(false);
		expect(parseTopupAmount("-10").ok).toBe(false);
	});
});
