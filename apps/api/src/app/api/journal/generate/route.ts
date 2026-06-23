/**
 * Journal daily generation — fan-out endpoint (journal-memory epic).
 *
 * Triggered by a QStash schedule. Selects every (organization, user) that had
 * chat-session activity on the target day (default: yesterday UTC) and enqueues
 * one per-user generation job each, so no single request blocks on N R1 calls.
 */

import { db } from "@rox/db/client";
import { chatSessions } from "@rox/db/schema";
import { Client } from "@upstash/qstash";
import { and, gte, lt } from "drizzle-orm";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";

const qstash = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL });

function yesterdayUtc(): string {
	const now = new Date();
	const d = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
	);
	return d.toISOString().slice(0, 10);
}

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate`,
		onError: "false",
	});
	if (!verified.ok) {
		return verified.response;
	}
	const { body } = verified;

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

	const publishResults = await Promise.allSettled(
		rows.map((row) =>
			qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate/user`,
				body: {
					organizationId: row.organizationId,
					userId: row.createdBy,
					day,
				},
				retries: 2,
			}),
		),
	);
	const failedPublishes = publishResults.filter(
		(result): result is PromiseRejectedResult => result.status === "rejected",
	);
	const queued = rows.length - failedPublishes.length;
	if (failedPublishes.length > 0) {
		logger.error("[journal/generate] Failed to enqueue some user jobs", {
			day,
			queued,
			failed: failedPublishes.length,
			total: rows.length,
			errors: failedPublishes.map((result) =>
				String(result.reason).slice(0, 500),
			),
		});
	}
	if (rows.length > 0 && queued === 0) {
		return Response.json(
			{
				error: "Failed to enqueue journal generation jobs",
				day,
				queued,
				failed: failedPublishes.length,
			},
			{ status: 500 },
		);
	}

	return Response.json({ day, queued, failed: failedPublishes.length });
}
