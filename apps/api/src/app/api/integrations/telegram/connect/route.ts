import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import type { TelegramConfig } from "@rox/db/schema";
import { integrationConnections, members } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";

const bodySchema = z.object({
	organizationId: z.string().uuid(),
	botToken: z.string().min(1),
});

type TelegramMeResponse = {
	ok: boolean;
	result?: { id: number; username?: string; is_bot: boolean };
};

type TelegramSetWebhookResponse = {
	ok: boolean;
	description?: string;
};

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(rawBody);
	if (!parsed.success) {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const { organizationId, botToken } = parsed.data;
	const userId = session.user.id;

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		return Response.json(
			{ error: "Not a member of this organization" },
			{ status: 403 },
		);
	}

	// Validate bot token via Telegram's getMe
	const meRes = await fetch(
		`https://api.telegram.org/bot${botToken}/getMe`,
	).catch(() => null);

	if (!meRes?.ok) {
		return Response.json({ error: "Invalid bot token" }, { status: 400 });
	}

	const meData = (await meRes.json()) as TelegramMeResponse;
	if (!meData.ok || !meData.result?.is_bot) {
		return Response.json({ error: "Invalid bot token" }, { status: 400 });
	}

	const botId = meData.result.id;
	const botUsername = meData.result.username ?? String(botId);

	// Register webhook with Telegram
	const webhookUrl = `${env.NEXT_PUBLIC_API_URL}/api/integrations/telegram/webhook`;
	const webhookBody: Record<string, string | string[]> = {
		url: webhookUrl,
		allowed_updates: ["message", "callback_query"],
	};

	if (env.TELEGRAM_WEBHOOK_SECRET) {
		webhookBody.secret_token = env.TELEGRAM_WEBHOOK_SECRET;
	}

	const setWebhookRes = await fetch(
		`https://api.telegram.org/bot${botToken}/setWebhook`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(webhookBody),
		},
	).catch(() => null);

	if (!setWebhookRes?.ok) {
		return Response.json(
			{ error: "Failed to register webhook" },
			{ status: 502 },
		);
	}

	const setWebhookData =
		(await setWebhookRes.json()) as TelegramSetWebhookResponse;
	if (!setWebhookData.ok) {
		return Response.json(
			{
				error: "Telegram rejected webhook registration",
				detail: setWebhookData.description,
			},
			{ status: 502 },
		);
	}

	const config: TelegramConfig = {
		provider: "telegram",
		botUsername,
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "telegram",
			accessToken: botToken,
			externalOrgId: String(botId),
			externalOrgName: botUsername,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: botToken,
				externalOrgId: String(botId),
				externalOrgName: botUsername,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	return Response.json({ success: true, botUsername });
}
