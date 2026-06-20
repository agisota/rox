import { describe, expect, test } from "bun:test";

import {
	type LedgerKindReason,
	type RoxLedgerKind,
	toLedgerKind,
} from "./rox-ledger-kind";

// Mirrors `roxLedgerKindValues` in @rox/db/enums. Kept inline so @rox/shared
// stays db-free (same pattern as integrations/registry.test.ts). If the db
// enum changes, the trpc-layer `satisfies` check in economy.service.ts fails.
const DB_LEDGER_KIND_VALUES: readonly RoxLedgerKind[] = [
	"topup",
	"request_charge",
	"adjustment",
	"seed",
	// Rox Workspace Suite D8/D9 — written directly by the Drive overage cron;
	// has no shared reason mapping (so `toLedgerKind` never returns it).
	"drive_overage",
];

describe("toLedgerKind", () => {
	test("maps every shared reason (+ seed) onto a db enum value (§2.4)", () => {
		expect(toLedgerKind("topup")).toBe("topup");
		expect(toLedgerKind("request")).toBe("request_charge");
		expect(toLedgerKind("grant")).toBe("adjustment");
		expect(toLedgerKind("adjustment")).toBe("adjustment");
		expect(toLedgerKind("seed")).toBe("seed");
	});

	test("only ever returns values that exist in the db enum", () => {
		const reasons: LedgerKindReason[] = [
			"topup",
			"request",
			"grant",
			"adjustment",
			"seed",
		];
		for (const reason of reasons) {
			expect(DB_LEDGER_KIND_VALUES).toContain(toLedgerKind(reason));
		}
	});

	test("throws on an unknown reason instead of silently mis-charging", () => {
		expect(() => toLedgerKind("nope" as LedgerKindReason)).toThrow();
	});
});
