/**
 * Calendar reminder dispatch — QStash cron endpoint (C6).
 *
 * Triggered by a QStash schedule on a ~5-minute cadence (cron `*\/5 * * * *`),
 * the same cadence as the ambient nudge + session learner. Each tick delivers
 * every `cal_reminders` row whose `next_fire_at` has arrived: `in_app`
 * reminders land in the journal "Лента" (`journal_events.kind =
 * 'calendar_reminder'`, replicated to web + desktop via Electric), `email`
 * reminders go through the gated Resend seam. Idempotent and bounded
 * (`MAX_REMINDERS_PER_TICK`); a recurring reminder re-advances `next_fire_at`
 * and stays scheduled, a one-off flips to `fired`, so a duplicate tick is a
 * no-op.
 *
 * Schedule registration (run once per environment, mirrors the ambient nudge
 * schedule — see `apps/api/src/app/api/ambient/nudge/route.ts`):
 *
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "destination": "'"$NEXT_PUBLIC_API_URL"'/api/calendar/reminders/dispatch",
 *           "cron": "*\/5 * * * *"
 *         }'
 */

import { env } from "@/env";
import { runDueReminders } from "@/lib/calendar/reminder-dispatch";
import { isQstashDevBypassAllowed, verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";
// Worst case: MAX_REMINDERS_PER_TICK × (deliver + settle).
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/calendar/reminders/dispatch`,
		devBypass: isQstashDevBypassAllowed(),
		onError: "false",
	});
	if (!verified.ok) return verified.response;

	const result = await runDueReminders();
	return Response.json(result);
}
