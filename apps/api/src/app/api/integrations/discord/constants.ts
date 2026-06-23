// Discord REST API base. Versioned per Discord's API guidelines; bump the
// version segment when adopting newer endpoints.
export const DISCORD_API_BASE = "https://discord.com/api/v10";

/** Default model for Discord assistant replies (mirrors the Telegram default). */
export const DEFAULT_DISCORD_MODEL = "claude-sonnet-4-6";

/**
 * Discord renders a follow-up message as a reply; content over this many chars
 * is rejected by the API. We truncate the agent answer to fit a single edit of
 * the deferred response.
 */
export const DISCORD_MESSAGE_MAX_CHARS = 2000;

/**
 * URL for editing the original (deferred) interaction response.
 *
 * For interactions Discord reuses the webhook-message route where `webhook_id`
 * is the application id and `webhook_token` is the interaction continuation
 * token. The token itself authenticates the call (no bot Authorization header)
 * and stays valid for 15 minutes after the interaction is received.
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
 */
export function discordOriginalResponseUrl(
	applicationId: string,
	interactionToken: string,
): string {
	return `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
}

// Inbound interaction kinds Discord posts to the interactions endpoint.
// https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type
export enum InteractionType {
	PING = 1,
	APPLICATION_COMMAND = 2,
	MESSAGE_COMPONENT = 3,
}

// Response kinds we may return to Discord for an interaction.
// https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
export enum InteractionResponseType {
	PONG = 1,
	CHANNEL_MESSAGE_WITH_SOURCE = 4,
	DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
}
