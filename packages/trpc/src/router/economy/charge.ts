/**
 * Atomic per-request charge helper (billing-economy epic, be-05).
 *
 * `chargeForUsage` debits a user's Rox balance, writes the append-only ledger
 * entry, and records the `usage_requests` row in a single transaction. Free
 * users are hard-stopped once their balance would go negative; subscribers may
 * run a postpaid (negative) balance — the gate is delegated to
 * `@rox/shared/rox-perks`.
 *
 * The chat / request execution path (be-09) calls this once per metered request.
 */

import { dbWs } from "@rox/db/client";
import { roxBalances, roxLedger, usageRequests } from "@rox/db/schema";
import { canAfford, type RoxPlanTier } from "@rox/shared/rox-perks";
import { STARTING_BALANCE_ROX } from "@rox/shared/rox-pricing";
import { eq } from "drizzle-orm";

export interface ChargeForUsageInput {
	userId: string;
	organizationId?: string | null;
	chatSessionId?: string | null;
	modelId: string;
	tokensIn: number;
	tokensOut: number;
	usdCost: number;
	roxCost: number;
	tier: RoxPlanTier;
	trace?: Record<string, unknown> | null;
}

export interface ChargeForUsageResult {
	usageRequestId: string;
	/** Resulting balance after the debit. */
	balanceRox: number;
	/** Rox charged for this request (>= 0). */
	chargedRox: number;
}

export class InsufficientRoxError extends Error {
	constructor(
		readonly balanceRox: number,
		readonly costRox: number,
	) {
		super(
			`Insufficient Rox balance: have ${balanceRox}, need ${costRox}. Top up to continue.`,
		);
		this.name = "InsufficientRoxError";
	}
}

/**
 * Debit `roxCost` from the user's balance and record the metered request.
 *
 * Atomic: balance read → affordability check → usage row → ledger → balance
 * update all run inside one serializable-ish transaction (`dbWs` Pool). The
 * balance row is lazily seeded with {@link STARTING_BALANCE_ROX} on first use.
 *
 * @throws {InsufficientRoxError} when a free-tier user cannot cover the cost.
 */
export async function chargeForUsage(
	input: ChargeForUsageInput,
): Promise<ChargeForUsageResult> {
	const costRox = Math.max(0, input.roxCost);

	return dbWs.transaction(async (tx) => {
		// Lazily seed the balance row (500 Rox) so the very first request charges
		// against the starting grant rather than a missing row.
		const existing = await tx.query.roxBalances.findFirst({
			where: eq(roxBalances.userId, input.userId),
		});

		let currentBalance: number;
		if (existing) {
			currentBalance = Number(existing.balanceRox);
		} else {
			await tx
				.insert(roxBalances)
				.values({
					userId: input.userId,
					balanceRox: String(STARTING_BALANCE_ROX),
				})
				.onConflictDoNothing();
			currentBalance = STARTING_BALANCE_ROX;
		}

		if (!canAfford(input.tier, currentBalance, costRox)) {
			throw new InsufficientRoxError(currentBalance, costRox);
		}

		const [usage] = await tx
			.insert(usageRequests)
			.values({
				userId: input.userId,
				organizationId: input.organizationId ?? null,
				chatSessionId: input.chatSessionId ?? null,
				modelId: input.modelId,
				tokensIn: input.tokensIn,
				tokensOut: input.tokensOut,
				usdCost: String(input.usdCost),
				roxCost: String(costRox),
				trace: input.trace ?? null,
			})
			.returning({ id: usageRequests.id });

		if (!usage) {
			throw new Error("Failed to record usage request");
		}

		await tx.insert(roxLedger).values({
			userId: input.userId,
			deltaRox: String(-costRox),
			kind: "request_charge",
			usageRequestId: usage.id,
		});

		const nextBalance = currentBalance - costRox;
		await tx
			.update(roxBalances)
			.set({ balanceRox: String(nextBalance) })
			.where(eq(roxBalances.userId, input.userId));

		return {
			usageRequestId: usage.id,
			balanceRox: nextBalance,
			chargedRox: costRox,
		};
	});
}
