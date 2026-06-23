/**
 * Per-session skill-learning — reconcile endpoint (journal-memory epic, phase 2).
 *
 * Triggered by a QStash schedule on a ~5-minute cadence (cron `*\/5 * * * *`).
 * Unlike the once-daily journal digest, this distils EACH chat session shortly after it
 * goes idle: it finds unlearned, recently-idle sessions, extracts durable
 * memories from each transcript via the cheap house model, upserts them as
 * suggested `memory_items`, and stamps each session `learned_at` so it is never
 * processed twice. Idempotent and self-contained — no per-user fan-out needed
 * because each tick is already capped (`MAX_SESSIONS_PER_TICK`).
 *
 * Schedule registration (run once per environment, mirrors the journal digest's
 * QStash schedule — see `apps/api/src/app/api/journal/generate/route.ts`):
 *
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "destination": "'"$NEXT_PUBLIC_API_URL"'/api/memory/learn",
 *           "cron": "*\/5 * * * *"
 *         }'
 */

import { Receiver } from "@upstash/qstash";
import { env } from "@/env";
import { learnIdleSessions } from "@/lib/memory/session-learn-generation";

export const dynamic = "force-dynamic";
// Worst case: MAX_SESSIONS_PER_TICK transcript fetches + cheap-model calls.
export const maxDuration = 300;

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	const valid = await receiver
		.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/memory/learn`,
		})
		.catch(() => false);
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const result = await learnIdleSessions();
	return Response.json(result);
}
