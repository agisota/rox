import { db } from "@rox/db/client";
import {
	integrationConnections,
	integrationInboundEvents,
} from "@rox/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { verifyTelegramSignature } from "../verify-signature";

const qstash = new Client({ token: env.QSTASH_TOKEN });

type TelegramUpdate = {
	update_id: number;
	message?: {
		message_id: number;
		from?: { id: number; username?: string; first_name?: string };
		chat?: { id: number; type: string };
		text?: string;
		date: number;
	};
	callback_query?: {
		id: string;
		from: { id: number };
		data?: string;
	};
};

export async function POST(request: Request) {
	const body = await request.text();

	// Verify secret token when configured
	const secretToken = env.TELEGRAM_WEBHOOK_SECRET;
	if (secretToken) {
		const headerValue = request.headers.get("x-telegram-bot-api-secret-token");
		if (!headerValue) {
			console.error("[telegram/webhook] Missing secret token header");
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		if (!verifyTelegramSignature({ secretToken, headerValue })) {
			console.error("[telegram/webhook] Secret token mismatch");
			return Response.json({ error: "Invalid secret token" }, { status: 401 });
		}
	}

	let update: TelegramUpdate;
	try {
		const parsed = JSON.parse(body);
		if (parsed === null || typeof parsed !== "object") {
			return Response.json({ error: "Invalid payload" }, { status: 400 });
		}
		update = parsed as TelegramUpdate;
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const updateId = String(update.update_id);

	// Dedup: skip already-processed updates (Telegram can redeliver)
	const alreadySeen = await db.query.integrationInboundEvents.findFirst({
		where: and(
			eq(integrationInboundEvents.provider, "telegram"),
			eq(integrationInboundEvents.externalEventId, updateId),
		),
		columns: { id: true },
	});

	if (alreadySeen) {
		return Response.json({ ok: true, status: "duplicate" });
	}

	// Find the active telegram connection to associate the event with
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "telegram"),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: { id: true, organizationId: true },
	});

	if (!connection) {
		console.warn("[telegram/webhook] No active Telegram connection found");
		return Response.json({ ok: true, status: "no_connection" });
	}

	await db
		.insert(integrationInboundEvents)
		.values({
			connectionId: connection.id,
			provider: "telegram",
			externalEventId: updateId,
		})
		.onConflictDoNothing();

	// Queue agent processing via QStash
	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/telegram/jobs/process-update`,
			body: {
				update,
				connectionId: connection.id,
				organizationId: connection.organizationId,
			},
			retries: 3,
		});
	} catch (err) {
		console.error("[telegram/webhook] Failed to queue update:", err);
	}

	// Telegram requires a 200 response within a few seconds
	return Response.json({ ok: true });
}
