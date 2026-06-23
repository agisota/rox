/**
 * Daily alias-retirement sweep (DQ4). QStash schedule (cron `0 3 * * *`).
 *
 * Demotes comms aliases past `alias_expires_at` and flips mail grace rows past
 * `grace_until` to `disabled`. The handle reservation in `identity_handles` is
 * NEVER touched — a previously-active handle stays permanently reserved (S1).
 *
 * Schedule registration (run once per environment, mirrors the journal digest's
 * QStash schedule — see `apps/api/src/app/api/journal/generate/route.ts`):
 *
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "destination": "'"$NEXT_PUBLIC_API_URL"'/api/identity/retire-aliases",
 *           "cron": "0 3 * * *"
 *         }'
 */

import { db } from "@rox/db/client";
import { retireExpiredAliases } from "@rox/db/utils";
import { env } from "@/env";
import { verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/identity/retire-aliases`,
		onError: "false",
	});
	if (!verified.ok) {
		return verified.response;
	}

	const result = await retireExpiredAliases(db);
	return Response.json(result);
}
