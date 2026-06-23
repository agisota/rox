/**
 * Drive overage accrual — daily cron (D8 §2.4, finding D2).
 *
 * Without this route `accrueDailyOverage` had no caller: overage bytes piled up
 * but the WS-E ledger was never debited (DQ2 soft-meter half-built). A QStash
 * schedule hits this once per day; it finds every user currently over their cap
 * AND opted into overage, then debits one day's prorated Rox cost per user. Each
 * accrual is idempotent per UTC day (a duplicate tick / retry is a no-op), so a
 * mis-fire never double-bills.
 *
 * Schedule registration (run once per environment, mirrors the journal digest):
 *
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "destination": "'"$NEXT_PUBLIC_API_URL"'/api/drive/accrue-overage",
 *           "cron": "0 3 * * *"
 *         }'
 */

import {
	accrueDailyOverage,
	listOverageUserIds,
} from "@rox/trpc/drive-economy";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";
// Worst case: one ledger transaction per over-quota user.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/drive/accrue-overage`,
		onError: "false",
	});
	if (!verified.ok) {
		return verified.response;
	}

	const userIds = await listOverageUserIds();

	const results = await Promise.allSettled(
		userIds.map((userId) => accrueDailyOverage(userId)),
	);

	let debited = 0;
	let skipped = 0;
	const failed = results.filter(
		(r): r is PromiseRejectedResult => r.status === "rejected",
	);
	for (const r of results) {
		if (r.status === "fulfilled") {
			if (r.value.ledgerWritten) debited += 1;
			else skipped += 1;
		}
	}

	if (failed.length > 0) {
		logger.error("[drive/accrue-overage] Some accruals failed", {
			total: userIds.length,
			debited,
			failed: failed.length,
			errors: failed.map((r) => String(r.reason).slice(0, 500)),
		});
	}

	return Response.json({
		total: userIds.length,
		debited,
		skipped,
		failed: failed.length,
	});
}
