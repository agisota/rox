/**
 * Drive quota reconciliation — nightly cron (D8 §2.4, finding D6).
 *
 * `bytes_used` is maintained incrementally by upload commits / deletes. Any
 * crashed commit, lost release, or out-of-band mutation leaves drift that would
 * otherwise be permanent and mis-bill overage. This route recomputes each user's
 * `bytes_used` from the authoritative source — the SUM of DISTINCT non-trashed
 * clean `sha256` sizes (per-user content dedup) — and writes the corrected
 * total. Idempotent: once aligned, a re-run is a no-op.
 *
 * Schedule registration (run once per environment):
 *
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "destination": "'"$NEXT_PUBLIC_API_URL"'/api/drive/reconcile-quota",
 *           "cron": "30 3 * * *"
 *         }'
 */

import { listQuotaUserIds, reconcileUserQuota } from "@rox/trpc/drive-economy";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";
// Worst case: one recompute query per user with a quota row.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/drive/reconcile-quota`,
		onError: "false",
	});
	if (!verified.ok) {
		return verified.response;
	}

	const userIds = await listQuotaUserIds();

	const results = await Promise.allSettled(
		userIds.map((userId) => reconcileUserQuota(userId)),
	);

	let corrected = 0;
	const failed = results.filter(
		(r): r is PromiseRejectedResult => r.status === "rejected",
	);
	for (const r of results) {
		if (r.status === "fulfilled" && r.value.drift !== 0) corrected += 1;
	}

	if (failed.length > 0) {
		logger.error("[drive/reconcile-quota] Some reconciliations failed", {
			total: userIds.length,
			corrected,
			failed: failed.length,
			errors: failed.map((r) => String(r.reason).slice(0, 500)),
		});
	}

	return Response.json({
		total: userIds.length,
		corrected,
		failed: failed.length,
	});
}
