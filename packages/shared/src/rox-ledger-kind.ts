/**
 * Ledger-kind translation layer (WS-E T1, fixes the §1.3.6 enum drift).
 *
 * The shared ledger core speaks `RoxLedgerReason`
 * (`"topup" | "request" | "grant" | "adjustment"`, `rox-ledger.ts`), but the
 * persisted Postgres enum `roxLedgerKindValues`
 * (`"topup" | "request_charge" | "adjustment" | "seed"`, `@rox/db/enums`) uses
 * different spellings and adds a `seed` kind for the starting grant. No
 * translation existed anywhere, so the persistence layer could not write a
 * `request`/`grant` reason without an invalid-enum failure.
 *
 * This pure mapper is the single source of truth for that translation. To keep
 * `@rox/shared` free of a `@rox/db` dependency (the same inline-mirror pattern
 * used by `integrations/registry.ts`), the db enum is mirrored locally as
 * {@link RoxLedgerKind}; a compile-time `satisfies` check in the consuming trpc
 * layer (`economy.service.ts`) pins it to the real `@rox/db/enums` type so a
 * future enum drift fails CI there. The `satisfies Record<…>` here additionally
 * makes adding a reason without a mapping a typecheck failure.
 */

import type { RoxLedgerReason } from "./rox-ledger";

/**
 * The persisted `rox_ledger.kind` enum values. Mirrors `roxLedgerKindValues`
 * in `@rox/db/enums` — kept inline so `@rox/shared` stays db-free. The trpc
 * layer asserts this matches the real enum at compile time.
 */
export type RoxLedgerKind = "topup" | "request_charge" | "adjustment" | "seed";

/**
 * Every reason the persistence layer can be asked to write: the shared
 * {@link RoxLedgerReason} values plus the synthetic `"seed"` used for the
 * 500-Rox starting grant (which has no shared-core counterpart).
 */
export type LedgerKindReason = RoxLedgerReason | "seed";

/**
 * Exhaustive map from a (shared reason | seed) to the persisted db enum value.
 * `satisfies` pins it to the full key set: drop a key and typecheck breaks.
 */
const LEDGER_KIND_BY_REASON = {
	topup: "topup",
	request: "request_charge",
	grant: "adjustment",
	adjustment: "adjustment",
	seed: "seed",
} as const satisfies Record<LedgerKindReason, RoxLedgerKind>;

/**
 * Translate a shared ledger reason (or the `"seed"` starting grant) into the
 * persisted `rox_ledger.kind` enum value. Pure, no I/O.
 *
 * @throws if handed a reason outside the known set (defensive: protects the
 * runtime path when an untyped/`as`-cast value sneaks in).
 */
export function toLedgerKind(reason: LedgerKindReason): RoxLedgerKind {
	const kind = LEDGER_KIND_BY_REASON[reason];
	if (kind === undefined) {
		throw new RangeError(`toLedgerKind: unknown ledger reason ${reason}`);
	}
	return kind;
}
