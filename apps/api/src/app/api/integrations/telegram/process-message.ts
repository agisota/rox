import { db } from "@rox/db/client";
import { integrationConnections } from "@rox/db/schema";
import { decodeSecret } from "@rox/trpc/integration-secret";
import { and, eq } from "drizzle-orm";
import type { ParsedTelegramMessage } from "./parse-update";
import {
	formatActionsForTelegram,
	formatErrorForTelegram,
	runTelegramAgent,
} from "./run-agent";
import { sendMessage } from "./telegram-client";

const TELEGRAM_MESSAGE_MAX_CHARS = 3900;

export type TelegramProcessMessagePayload = {
	connectionId: string;
	update: ParsedTelegramMessage;
};

function splitTelegramMessage(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	const chunks: string[] = [];
	for (let i = 0; i < trimmed.length; i += TELEGRAM_MESSAGE_MAX_CHARS) {
		chunks.push(trimmed.slice(i, i + TELEGRAM_MESSAGE_MAX_CHARS));
	}
	return chunks;
}

async function sendTelegramText({
	botToken,
	chatId,
	text,
}: {
	botToken: string;
	chatId: number;
	text: string;
}): Promise<number> {
	const chunks = splitTelegramMessage(text);
	for (const chunk of chunks) {
		await sendMessage({ botToken, chatId, text: chunk });
	}
	return chunks.length;
}

export async function processTelegramMessage(
	payload: TelegramProcessMessagePayload,
): Promise<{
	success: true;
	skipped?: true;
	replied?: boolean;
	messagesSent?: number;
	reason?: string;
}> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.id, payload.connectionId),
			eq(integrationConnections.provider, "telegram"),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return {
			success: true,
			skipped: true,
			reason: "No active Telegram connection",
		};
	}

	let botToken: string;
	try {
		botToken = decodeSecret(connection.accessToken);
	} catch {
		console.warn(
			`[telegram/process-message] failed to decode bot token for connection ${connection.id}`,
		);
		return {
			success: true,
			skipped: true,
			reason: "Could not decode Telegram bot token",
		};
	}

	try {
		const result = await runTelegramAgent({
			prompt: payload.update.text,
			organizationId: connection.organizationId,
			userId: connection.connectedByUserId,
		});

		let messagesSent = await sendTelegramText({
			botToken,
			chatId: payload.update.chatId,
			text: result.text,
		});

		const actionsText = formatActionsForTelegram(result.actions);
		if (actionsText) {
			messagesSent += await sendTelegramText({
				botToken,
				chatId: payload.update.chatId,
				text: actionsText,
			});
		}

		return { success: true, replied: true, messagesSent };
	} catch (error) {
		console.error("[telegram/process-message] Agent failed:", error);
		const text = await formatErrorForTelegram(error);
		const messagesSent = await sendTelegramText({
			botToken,
			chatId: payload.update.chatId,
			text,
		});
		return { success: true, replied: false, messagesSent };
	}
}
