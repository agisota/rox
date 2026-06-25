import { describe, expect, test } from "bun:test";
import { recentsInputSchema } from "./recents-schema";

// `chat.recents` (F49) powers the scrollback rail's cross-session Recents-flyout.
// The DB query is a thin org-scoped `select … order by lastActiveAt desc limit`;
// the contract worth pinning is the input clamp (bounded, defaulted) so the
// flyout never over-fetches. Mirrors the schema-level testing in
// `labels-schema.test.ts` (no live DB required).
describe("recentsInputSchema (chat.recents limit clamp)", () => {
	test("defaults the limit to ~10 when omitted", () => {
		expect(recentsInputSchema.parse(undefined)).toBeUndefined();
		expect(recentsInputSchema.parse({})).toEqual({ limit: 10 });
	});

	test("accepts an explicit in-range limit", () => {
		expect(recentsInputSchema.parse({ limit: 5 })).toEqual({ limit: 5 });
		expect(recentsInputSchema.parse({ limit: 25 })).toEqual({ limit: 25 });
	});

	test("rejects a non-positive limit", () => {
		expect(() => recentsInputSchema.parse({ limit: 0 })).toThrow();
		expect(() => recentsInputSchema.parse({ limit: -1 })).toThrow();
	});

	test("rejects a limit above the 25 cap", () => {
		expect(() => recentsInputSchema.parse({ limit: 26 })).toThrow();
	});

	test("rejects a non-integer limit", () => {
		expect(() => recentsInputSchema.parse({ limit: 3.5 })).toThrow();
	});
});
