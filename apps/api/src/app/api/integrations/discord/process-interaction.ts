import { db } from "@rox/db/client";
import { integrationConnections } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { DISCORD_MESSAGE_MAX_CHARS } from "./constants";
import { editOriginalInteractionResponse } from "./discord-client";
import {
	formatActionsForDiscord,
	formatErrorForDiscord,
	runDiscordAgent,
} from "./run-agent";

/**
 * The slice of a parsed interaction the worker needs to run the agent and edit
 * the deferred response. `token` + `applicationId` authenticate the follow-up
 * edit; `text` is the user's slash-command prompt.
 */
export type DiscordProcessInteractionPayload = {
	connectionId: string;
	interaction: {
		id: string;
		token: string;
		applicationId: string;
		text: string;
	};
};

/** Discord rejects follow-up content over the per-message limit; truncate to fit. */
function clampDiscordContent(text: string): string {
	const trimmed = text.trim() || "Done!";
	if (trimmed.length <= DISCORD_MESSAGE_MAX_CHARS) return trimmed;
	// Reserve one char for the ellipsis so the result still fits the cap.
	return `${trimmed.slice(0, DISCORD_MESSAGE_MAX_CHARS - 1)}…`;
}

/**
 * Runs the Rox agent for a deferred Discord interaction and edits the original
 * (deferred) response with the result, resolving the bot's "thinking…" state.
 *
 * Mirrors `processTelegramMessage`: load the active connection, run the shared
 * agent loop, then deliver the answer. Unlike Telegram (token in the URL path),
 * the deferred edit is authenticated by the interaction token itself, so no
 * stored bot token is decoded here.
 *
 * Idempotent under QStash/Discord redelivery: the route dedups on the
 * interaction id before enqueuing, and the edit overwrites `@original`, so a
 * retried job converges on the same final message rather than duplicating it.
 */
export async function processDiscordInteraction(
	payload: DiscordProcessInteractionPayload,
): Promise<{
	success: true;
	skipped?: true;
	replied?: boolean;
	reason?: string;
}> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.id, payload.connectionId),
			eq(integrationConnections.provider, "discord"),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return {
			success: true,
			skipped: true,
			reason: "No active Discord connection",
		};
	}

	const { token, applicationId } = payload.interaction;

	try {
		const result = await runDiscordAgent({
			prompt: payload.interaction.text,
			organizationId: connection.organizationId,
			userId: connection.connectedByUserId,
		});

		const actionsText = formatActionsForDiscord(result.actions);
		const content = clampDiscordContent(
			actionsText ? `${result.text}\n\n${actionsText}` : result.text,
		);

		await editOriginalInteractionResponse({
			applicationId,
			interactionToken: token,
			content,
		});

		return { success: true, replied: true };
	} catch (error) {
		logger.error("[discord/process-interaction] Agent failed:", error);
		try {
			const content = await formatErrorForDiscord(error);
			await editOriginalInteractionResponse({
				applicationId,
				interactionToken: token,
				content,
			});
			return { success: true, replied: false };
		} catch (fallbackError) {
			logger.error(
				"[discord/process-interaction] Failed to edit deferred response with fallback error:",
				fallbackError,
			);
			return {
				success: true,
				replied: false,
				reason: "Agent failed and fallback reply could not be sent",
			};
		}
	}
}
