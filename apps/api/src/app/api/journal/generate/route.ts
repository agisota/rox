/**
 * Journal daily generation — fan-out endpoint (journal-memory epic).
 *
 * Triggered by a QStash schedule. Selects every (organization, user) that had
 * chat-session activity on the target day (default: yesterday UTC) and enqueues
 * one per-user generation job each, so no single request blocks on N R1 calls.
 */

import { db } from "@rox/db/client";
import { chatSessions } from "@rox/db/schema";
import { Client, Receiver } from "@upstash/qstash";
import { and, gte, lt } from "drizzle-orm";
import { env } from "@/env";

export const dynamic = "force-dynamic";

const qstash = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL });
const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

function yesterdayUtc(): string {
	const now = new Date();
	const d = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
	);
	return d.toISOString().slice(0, 10);
}

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
			url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate`,
		})
		.catch(() => false);
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = body ? (JSON.parse(body) as { day?: string }) : {};
	const day =
		typeof parsed.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.day)
			? parsed.day
			: yesterdayUtc();

	const start = new Date(`${day}T00:00:00.000Z`);
	const end = new Date(start.getTime() + 86_400_000);

	const rows = await db
		.selectDistinct({
			organizationId: chatSessions.organizationId,
			createdBy: chatSessions.createdBy,
		})
		.from(chatSessions)
		.where(
			and(
				gte(chatSessions.lastActiveAt, start),
				lt(chatSessions.lastActiveAt, end),
			),
		);

	let queued = 0;
	for (const row of rows) {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate/user`,
			body: { organizationId: row.organizationId, userId: row.createdBy, day },
			retries: 2,
		});
		queued++;
	}

	return Response.json({ day, queued });
}
