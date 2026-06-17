import { db } from "@rox/db/client";
import { integrationConnections } from "@rox/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { parseTelegramUpdate } from "../parse-update";

/**
 * Header Telegram echoes on every update, carrying the per-connection secret we
 * registered via `setWebhook({ secret_token })`. Telegram has no request
 * signing, so this header is the only inbound authenticator.
 */
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

export async function POST(request: Request) {
	const secret = request.headers.get(SECRET_HEADER);
	if (!secret) {
		return Response.json({ error: "Missing secret token" }, { status: 401 });
	}

	// Resolve the org by matching the echoed secret against a stored
	// connection.webhookSecret. We fetch active Telegram connections and match in
	// JS rather than push the jsonb comparison into SQL — the set is tiny and this
	// keeps the lookup trivially testable.
	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "telegram"),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [asc(integrationConnections.id)],
	});

	const connection = connections.find(
		(row) =>
			row.config?.provider === "telegram" &&
			typeof row.config.webhookSecret === "string" &&
			row.config.webhookSecret === secret,
	);

	if (!connection) {
		console.error("[telegram/webhook] No connection matched secret token");
		return Response.json({ error: "Unknown secret token" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		// Malformed JSON: ack so Telegram stops retrying this delivery.
		console.error("[telegram/webhook] Failed to parse update payload");
		return new Response("ok", { status: 200 });
	}

	const update = parseTelegramUpdate(body);

	// Ignore unsupported updates and messages authored by bots (prevents loops).
	if (!update || update.fromIsBot) {
		return new Response("ok", { status: 200 });
	}

	console.info("[telegram/webhook] Inbound message", {
		connectionId: connection.id,
		organizationId: connection.organizationId,
		chatId: update.chatId,
		fromUserId: update.fromUserId,
		textLength: update.text.length,
	});

	// TODO(telegram PR-2): enqueue QStash process-message job -> runTelegramAgent
	// (mirror slack/events publishJSON to a /jobs/process-message route). For this
	// PR we only acknowledge inbound updates.

	// Telegram retries on any non-200, so always ack quickly for valid updates.
	return new Response("ok", { status: 200 });
}
