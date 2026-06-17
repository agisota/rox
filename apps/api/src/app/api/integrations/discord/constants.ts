// Discord REST API base. Versioned per Discord's API guidelines; bump the
// version segment when adopting newer endpoints.
export const DISCORD_API_BASE = "https://discord.com/api/v10";

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
