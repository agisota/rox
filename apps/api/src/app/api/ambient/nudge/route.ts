/**
 * Ambient agent — reconcile endpoint (ambient-intelligence epic, phase 4b, "Act").
 *
 * Triggered by a QStash schedule on a ~5-minute cadence (cron `*\/5 * * * *`),
 * the same cadence as the per-session learner. Each tick emits at most ONE short
 * proactive nudge per opted-in user into the journal "Лента"
 * (`journal_events.kind = 'ambient_nudge'`), built from that user's approved
 * memories + recent events. Idempotent and self-contained — each tick is capped
 * (`MAX_USERS_PER_TICK`) and per-user rate-limited, and the whole job is a no-op
 * unless the user opted in (`user_ambient_settings.ambient_enabled`) and R1 is
 * configured.
 *
 * Schedule registration (run once per environment, mirrors the session-learn
 * schedule — see `apps/api/src/app/api/memory/learn/route.ts`):
 *
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "destination": "'"$NEXT_PUBLIC_API_URL"'/api/ambient/nudge",
 *           "cron": "*\/5 * * * *"
 *         }'
 */

import { env } from "@/env";
import { runAmbientNudges } from "@/lib/ambient/ambient-generation";
import { isQstashDevBypassAllowed, verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";
// Worst case: MAX_USERS_PER_TICK × (rate check + signal check + cheap-model call).
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/ambient/nudge`,
		devBypass: isQstashDevBypassAllowed(),
		onError: "false",
	});
	if (!verified.ok) return verified.response;

	const result = await runAmbientNudges();
	return Response.json(result);
}
