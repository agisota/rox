import { db } from "@rox/db/client";
import type { LarkConfig } from "@rox/db/schema";
import { integrationConnections } from "@rox/db/schema";
import { decodeSecret } from "@rox/trpc/integration-secret";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getTenantAccessToken, replyMessage, sendMessage } from "./lark-client";
import {
	formatActionsForLark,
	formatErrorForLark,
	runLarkAgent,
} from "./run-agent";

/**
 * Inbound Lark messages are short chat turns; replies stay well under Lark's
 * per-message limit, so unlike Telegram we send the answer and the action
 * summary as (at most) two messages without chunking.
 */

export type LarkProcessMessagePayload = {
	connectionId: string;
	/** Chat the message arrived in; the fallback send target. */
	chatId: string;
	/** Originating message id; the preferred (threaded) reply target. */
	messageId: string | null;
	/** Stable per-delivery id, reused as the Lark reply `uuid` for idempotency. */
	eventId: string | null;
	/** The user's message text. */
	text: string;
};

/** Narrow a stored integration config to the Lark variant. */
function asLarkConfig(config: unknown): LarkConfig | null {
	if (config && typeof config === "object" && "provider" in config) {
		const candidate = config as { provider?: unknown };
		if (candidate.provider === "lark") return config as LarkConfig;
	}
	return null;
}

/**
 * Posts `text` back to the originating chat. Prefers a threaded reply to the
 * source message; falls back to a fresh chat message when no `message_id` is
 * available. `uuidSuffix` keeps multiple outbound messages for one delivery from
 * colliding on the same idempotency uuid.
 */
async function postLarkText({
	tenantAccessToken,
	chatId,
	messageId,
	eventId,
	text,
	uuidSuffix,
}: {
	tenantAccessToken: string;
	chatId: string;
	messageId: string | null;
	eventId: string | null;
	text: string;
	uuidSuffix: string;
}): Promise<void> {
	const uuid = eventId ? `${eventId}:${uuidSuffix}` : undefined;
	if (messageId) {
		await replyMessage({ tenantAccessToken, messageId, text, uuid });
		return;
	}
	await sendMessage({ tenantAccessToken, chatId, text, uuid });
}

export async function processLarkMessage(
	payload: LarkProcessMessagePayload,
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
			eq(integrationConnections.provider, "lark"),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return {
			success: true,
			skipped: true,
			reason: "No active Lark connection",
		};
	}

	const config = asLarkConfig(connection.config);
	if (!config?.appId) {
		logger.warn(
			`[lark/process-message] connection ${connection.id} is missing appId`,
		);
		return {
			success: true,
			skipped: true,
			reason: "Lark connection missing appId",
		};
	}

	let appSecret: string;
	try {
		appSecret = decodeSecret(connection.accessToken);
	} catch {
		logger.warn(
			`[lark/process-message] failed to decode app secret for connection ${connection.id}`,
		);
		return {
			success: true,
			skipped: true,
			reason: "Could not decode Lark app secret",
		};
	}

	let tenantAccessToken: string;
	try {
		tenantAccessToken = await getTenantAccessToken({
			appId: config.appId,
			appSecret,
		});
	} catch (error) {
		logger.error("[lark/process-message] Failed to mint tenant token:", error);
		// Without a token we cannot reply at all; ack the job (no retry) since a
		// bad/expired credential will not fix itself on redelivery.
		return {
			success: true,
			replied: false,
			messagesSent: 0,
			reason: "Could not obtain Lark tenant access token",
		};
	}

	try {
		const result = await runLarkAgent({
			prompt: payload.text,
			organizationId: connection.organizationId,
			userId: connection.connectedByUserId,
		});

		await postLarkText({
			tenantAccessToken,
			chatId: payload.chatId,
			messageId: payload.messageId,
			eventId: payload.eventId,
			text: result.text,
			uuidSuffix: "reply",
		});
		let messagesSent = 1;

		const actionsText = formatActionsForLark(result.actions);
		if (actionsText) {
			await postLarkText({
				tenantAccessToken,
				chatId: payload.chatId,
				messageId: payload.messageId,
				eventId: payload.eventId,
				text: actionsText,
				uuidSuffix: "actions",
			});
			messagesSent += 1;
		}

		return { success: true, replied: true, messagesSent };
	} catch (error) {
		logger.error("[lark/process-message] Agent failed:", error);
		try {
			const text = await formatErrorForLark(error);
			await postLarkText({
				tenantAccessToken,
				chatId: payload.chatId,
				messageId: payload.messageId,
				eventId: payload.eventId,
				text,
				uuidSuffix: "error",
			});
			return { success: true, replied: false, messagesSent: 1 };
		} catch (fallbackError) {
			logger.error(
				"[lark/process-message] Failed to send fallback error reply:",
				fallbackError,
			);
			return {
				success: true,
				replied: false,
				messagesSent: 0,
				reason: "Agent failed and fallback reply could not be sent",
			};
		}
	}
}
