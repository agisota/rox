/**
 * Drive quota engine (D8 §2.4) — DB-backed atomic accounting on top of the pure
 * `@rox/shared/drive-quota` math.
 *
 * Responsibilities:
 *  - {@link ensureQuota} — read-or-seed a user's `storage_quota` row (10 GiB
 *    default via the column default, mirroring `economy.service.ensureBalance`).
 *  - {@link commitUpload} — atomic `UPDATE ... WHERE bytes_used + :size <= cap`
 *    for the hard path; when the user opted into overage (DQ2 soft-meter) the
 *    add is unconditional so the upload still lands and accrues overage.
 *  - {@link releaseBytes} — clamped decrement on hard-delete (never below 0).
 *  - {@link accrueDailyOverage} — daily helper: compute over-quota GB-month →
 *    write a `rox_ledger` row kind `drive_overage` debiting the balance. Reuses
 *    the WS-E ledger table; does NOT add a new ledger kind (already in the enum).
 *
 * Existing files always stay readable when a user is over quota — only NEW
 * uploads are gated, and only when overage is off.
 */

import { db } from "@rox/db/client";
import {
	driveFiles,
	roxBalances,
	roxLedger,
	storageQuota,
} from "@rox/db/schema";
import {
	clampDecrement,
	computeUploadDecision,
	DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH,
	DRIVE_FREE_QUOTA_BYTES,
	dailyOverageRox,
	overQuotaBytes,
	type UploadDecision,
} from "@rox/shared/drive-quota";
import { and, eq, gte, sql } from "drizzle-orm";

export {
	DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH,
	DRIVE_FREE_QUOTA_BYTES,
} from "@rox/shared/drive-quota";

/** Snapshot of a user's accounting row. */
export interface QuotaRow {
	bytesUsed: number;
	quotaBytes: number;
	overageOptIn: boolean;
}

/**
 * Ensure a `storage_quota` row exists for the user and return its current
 * snapshot. Seeds the 10 GiB default via the column default on first read
 * (insert-on-conflict-do-nothing), exactly like `rox_balances` seeding.
 */
export async function ensureQuota(userId: string): Promise<QuotaRow> {
	await db
		.insert(storageQuota)
		.values({ userId })
		.onConflictDoNothing({ target: storageQuota.userId });

	const row = await db.query.storageQuota.findFirst({
		where: eq(storageQuota.userId, userId),
		columns: { bytesUsed: true, quotaBytes: true, overageOptIn: true },
	});

	return {
		bytesUsed: row ? Number(row.bytesUsed) : 0,
		quotaBytes: row ? Number(row.quotaBytes) : DRIVE_FREE_QUOTA_BYTES,
		overageOptIn: row?.overageOptIn ?? false,
	};
}

/**
 * Set the user's overage opt-in flag (DQ2 soft-meter). Seeds the row first so a
 * never-touched user can opt in before their first upload, then returns the
 * updated snapshot. This is the ONLY writer of `overage_opt_in` — without it the
 * flag could never become true and the soft-meter was unreachable (finding D1).
 */
export async function setOverageOptIn(
	userId: string,
	optIn: boolean,
): Promise<QuotaRow> {
	await db
		.insert(storageQuota)
		.values({ userId, overageOptIn: optIn })
		.onConflictDoUpdate({
			target: storageQuota.userId,
			set: { overageOptIn: optIn },
		});
	return ensureQuota(userId);
}

/** Result of attempting to commit an upload's bytes to the quota counter. */
export interface CommitUploadResult extends UploadDecision {
	/** Whether the conditional UPDATE actually applied (false = lost the race). */
	committed: boolean;
}

/**
 * Atomically add `sizeBytes` to a user's `bytes_used`, enforcing the cap.
 *
 * Hard path (overage OFF): a conditional `UPDATE ... WHERE bytes_used + size <=
 * quota_bytes` so two parallel uploads cannot both pass the cap — exactly one
 * wins; the loser gets `committed: false`.
 *
 * Soft path (overage ON, DQ2): the add is unconditional so the upload always
 * lands; the bytes past the cap are reported via `overageBytes` for the daily
 * overage job to bill.
 *
 * `ensureQuota` must have seeded the row first (the router does this in
 * `requestUpload`'s pre-flight). Returns the decision plus whether it committed.
 */
export async function commitUpload(
	userId: string,
	sizeBytes: number,
): Promise<CommitUploadResult> {
	const snapshot = await ensureQuota(userId);
	const decision = computeUploadDecision(snapshot, sizeBytes);

	if (!decision.allowed) {
		return { ...decision, committed: false };
	}

	const size = Math.max(0, Math.trunc(sizeBytes));
	if (size === 0) {
		return { ...decision, committed: true };
	}

	if (decision.reason === "overage_accrued") {
		// Soft-meter: unconditional add (already over or going over with opt-in).
		await db
			.update(storageQuota)
			.set({ bytesUsed: sql`${storageQuota.bytesUsed} + ${size}` })
			.where(eq(storageQuota.userId, userId));
		return { ...decision, committed: true };
	}

	// Hard path: conditional add guarded by the cap (race-safe).
	const updated = await db
		.update(storageQuota)
		.set({ bytesUsed: sql`${storageQuota.bytesUsed} + ${size}` })
		.where(
			and(
				eq(storageQuota.userId, userId),
				sql`${storageQuota.bytesUsed} + ${size} <= ${storageQuota.quotaBytes}`,
			),
		)
		.returning({ bytesUsed: storageQuota.bytesUsed });

	const committed = updated.length > 0;
	return {
		...decision,
		committed,
		...(committed ? {} : { allowed: false, reason: "over_quota_blocked" }),
	};
}

/**
 * Decrement `bytes_used` by a hard-deleted file's size, clamped so the counter
 * never goes negative (mirrors the DB CHECK `bytes_used >= 0`). Idempotent-ish:
 * a too-large size collapses to whatever is left.
 */
export async function releaseBytes(
	userId: string,
	sizeBytes: number,
): Promise<void> {
	const snapshot = await ensureQuota(userId);
	const dec = clampDecrement(snapshot.bytesUsed, sizeBytes);
	if (dec === 0) return;
	await db
		.update(storageQuota)
		.set({ bytesUsed: sql`${storageQuota.bytesUsed} - ${dec}` })
		.where(eq(storageQuota.userId, userId));
}

/** Outcome of a daily overage accrual for one user. */
export interface OverageAccrual {
	overBytes: number;
	roxDebited: number;
	ledgerWritten: boolean;
	/** True when an accrual for today already existed (idempotent no-op). */
	alreadyAccrued?: boolean;
}

/** Start of the current UTC day — the idempotency window for daily accrual. */
function startOfUtcDay(now: Date = new Date()): Date {
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
}

/**
 * Whether a `drive_overage` ledger row already exists for this user today.
 * Makes {@link accrueDailyOverage} idempotent per UTC day so a re-run (QStash
 * retry, double schedule tick) never double-bills.
 */
async function hasAccruedToday(userId: string): Promise<boolean> {
	const [existing] = await db
		.select({ id: roxLedger.id })
		.from(roxLedger)
		.where(
			and(
				eq(roxLedger.userId, userId),
				eq(roxLedger.kind, "drive_overage"),
				gte(roxLedger.createdAt, startOfUtcDay()),
			),
		)
		.limit(1);
	return Boolean(existing);
}

/**
 * Daily overage accrual (D8 §2.4, DQ2). Computes the user's current over-quota
 * bytes, converts the GB-month rate to a single day's Rox cost, and — when
 * non-zero — writes a `rox_ledger` row (kind `drive_overage`, negative delta)
 * and debits `rox_balances`. No-op (no ledger row) when the user is within
 * quota or the cost rounds to zero.
 *
 * Idempotent per UTC day (finding D2 hardening): the whole accrual runs inside a
 * single transaction and the ledger insert relies on the partial unique index
 * `rox_ledger_overage_user_day_uniq` (one `drive_overage` row per user per UTC
 * day). The insert uses ON CONFLICT DO NOTHING and treats zero rows returned as
 * "already accrued today" — so overlapping/back-to-back ticks (QStash retry,
 * double schedule) debit EXACTLY once even when their pre-checks race. The
 * pre-tx {@link hasAccruedToday} fast-path still short-circuits the common
 * already-billed case without opening a transaction.
 *
 * Reuses the existing WS-E balance/ledger machinery verbatim; the `drive_overage`
 * kind already exists in `roxLedgerKindValues` (no new kind added).
 */
export async function accrueDailyOverage(
	userId: string,
	roxPerGbMonth: number = DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH,
	daysInMonth = 30,
): Promise<OverageAccrual> {
	const snapshot = await ensureQuota(userId);
	const overBytes = overQuotaBytes(snapshot);
	const rox = dailyOverageRox(overBytes, roxPerGbMonth, daysInMonth);

	if (rox <= 0) {
		return { overBytes, roxDebited: 0, ledgerWritten: false };
	}

	// Fast-path no-op: if an overage row already landed today, skip the tx. This
	// is an optimization, NOT the correctness guarantee — the DB constraint below
	// is what makes concurrent ticks safe.
	if (await hasAccruedToday(userId)) {
		return {
			overBytes,
			roxDebited: 0,
			ledgerWritten: false,
			alreadyAccrued: true,
		};
	}

	const accrued = await db.transaction(async (tx) => {
		await tx
			.insert(roxBalances)
			.values({ userId })
			.onConflictDoNothing({ target: roxBalances.userId });

		// Atomic idempotency: the partial unique index guarantees one accrual per
		// user/UTC-day. ON CONFLICT DO NOTHING + RETURNING means a racing tick that
		// lost the insert gets NO row, so we skip the debit entirely.
		const inserted = await tx
			.insert(roxLedger)
			.values({
				userId,
				deltaRox: String(-rox),
				kind: "drive_overage",
			})
			.onConflictDoNothing({
				target: [roxLedger.userId, roxLedger.utcDay],
				where: sql`${roxLedger.kind} = 'drive_overage'`,
			})
			.returning({ id: roxLedger.id });

		if (inserted.length === 0) return false;

		await tx
			.update(roxBalances)
			.set({ balanceRox: sql`${roxBalances.balanceRox} - ${rox}` })
			.where(eq(roxBalances.userId, userId));
		return true;
	});

	if (!accrued) {
		return {
			overBytes,
			roxDebited: 0,
			ledgerWritten: false,
			alreadyAccrued: true,
		};
	}

	return { overBytes, roxDebited: rox, ledgerWritten: true };
}

/**
 * User ids that currently owe overage: over their cap AND opted in (DQ2). The
 * daily overage cron fans out one accrual per id. Self-correcting — driven by
 * the live `bytes_used` snapshot, not a per-upload delta log.
 */
export async function listOverageUserIds(): Promise<string[]> {
	const rows = await db
		.select({ userId: storageQuota.userId })
		.from(storageQuota)
		.where(
			and(
				eq(storageQuota.overageOptIn, true),
				sql`${storageQuota.bytesUsed} > ${storageQuota.quotaBytes}`,
			),
		);
	return rows.map((r) => r.userId);
}

/** Every user with a quota row — the reconciliation cron's fan-out set. */
export async function listQuotaUserIds(): Promise<string[]> {
	const rows = await db
		.select({ userId: storageQuota.userId })
		.from(storageQuota);
	return rows.map((r) => r.userId);
}

/** Outcome of a per-user quota reconciliation. */
export interface ReconcileResult {
	before: number;
	after: number;
	drift: number;
}

/**
 * Nightly quota reconciliation (D8 §2.4, finding D6). Recompute `bytes_used`
 * from the authoritative source — the SUM of DISTINCT non-trashed `sha256` sizes
 * the user owns (per-user content dedup means each distinct content is counted
 * once) — and write the corrected total. Self-healing against any drift left by
 * a crashed commit/release; idempotent (running twice is a no-op once aligned).
 *
 * Only `clean` files count toward usage (matching the commit path, which only
 * commits bytes on a clean confirm).
 */
export async function reconcileUserQuota(
	userId: string,
): Promise<ReconcileResult> {
	const snapshot = await ensureQuota(userId);

	const rows = await db
		.selectDistinct({
			sha256: driveFiles.sha256,
			sizeBytes: driveFiles.sizeBytes,
		})
		.from(driveFiles)
		.where(
			and(
				eq(driveFiles.userId, userId),
				eq(driveFiles.status, "clean"),
				sql`${driveFiles.trashedAt} IS NULL`,
			),
		);

	const after = rows.reduce(
		(sum, r) => sum + Math.max(0, Number(r.sizeBytes)),
		0,
	);

	if (after !== snapshot.bytesUsed) {
		await db
			.update(storageQuota)
			.set({ bytesUsed: after })
			.where(eq(storageQuota.userId, userId));
	}

	return {
		before: snapshot.bytesUsed,
		after,
		drift: after - snapshot.bytesUsed,
	};
}
