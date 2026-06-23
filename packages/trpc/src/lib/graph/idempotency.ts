/**
 * Graph core (#01) — atomic idempotency claim protocol (spec §2.1).
 *
 * Side-effecting POST mutations (graph.create/promote/link/resolveIdentity/…)
 * are made idempotent by claiming an `idempotency_keys` row in the SAME
 * transaction as the effect. The claim uses
 * `INSERT … ON CONFLICT (org, scope, key) DO NOTHING RETURNING id` so two
 * concurrent requests with the same key cannot both create the effect: exactly
 * one wins the claim, the other reads back the cached result. A unique-violation
 * is therefore never surfaced as a 5xx.
 *
 * Usage inside a `dbWs.transaction`:
 *
 *   const claim = await claimIdempotencyKey(tx, { organizationId, scope, key });
 *   if (!claim.claimed) return <load cached result from claim.existing>;
 *   const effect = await <do the INSERT(s)>;
 *   await finalizeIdempotencyKey(tx, { id: claim.id, resultEntityId, result });
 *   return effect;
 */

import { idempotencyKeys } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import type { GraphTx } from "./types";

export interface ClaimParams {
	organizationId: string;
	scope: string;
	key: string;
}

/** The cached row surfaced when a claim is lost (conflict). */
export interface ClaimedExisting {
	id: string;
	resultEntityId: string | null;
	result: Record<string, unknown> | null;
}

export type ClaimResult =
	| { claimed: true; id: string }
	| { claimed: false; existing: ClaimedExisting | null };

/**
 * Atomically claim an idempotency key. Returns `{ claimed: true, id }` when this
 * caller won the claim (first time → proceed with the effect), or
 * `{ claimed: false, existing }` when the key already existed (retry/race →
 * return the cached result instead of re-running the effect).
 */
export async function claimIdempotencyKey(
	tx: GraphTx,
	params: ClaimParams,
): Promise<ClaimResult> {
	const [claimed] = await tx
		.insert(idempotencyKeys)
		.values({
			organizationId: params.organizationId,
			scope: params.scope,
			key: params.key,
		})
		.onConflictDoNothing({
			target: [
				idempotencyKeys.organizationId,
				idempotencyKeys.scope,
				idempotencyKeys.key,
			],
		})
		.returning({ id: idempotencyKeys.id });

	if (claimed) return { claimed: true, id: claimed.id };

	const [existing] = await tx
		.select({
			id: idempotencyKeys.id,
			resultEntityId: idempotencyKeys.resultEntityId,
			result: idempotencyKeys.result,
		})
		.from(idempotencyKeys)
		.where(
			and(
				eq(idempotencyKeys.organizationId, params.organizationId),
				eq(idempotencyKeys.scope, params.scope),
				eq(idempotencyKeys.key, params.key),
			),
		)
		.limit(1);

	return { claimed: false, existing: existing ?? null };
}

/** Record the effect's result against a claimed key (same transaction). */
export async function finalizeIdempotencyKey(
	tx: GraphTx,
	params: {
		id: string;
		resultEntityId?: string | null;
		result?: Record<string, unknown> | null;
	},
): Promise<void> {
	await tx
		.update(idempotencyKeys)
		.set({
			resultEntityId: params.resultEntityId ?? null,
			result: params.result ?? null,
		})
		.where(eq(idempotencyKeys.id, params.id));
}
