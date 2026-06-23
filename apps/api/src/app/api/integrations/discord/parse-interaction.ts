// Normalized shape of an inbound Discord interaction, narrowed to the fields the
// Rox vertical needs. Returns `null` for non-object input so callers can reject
// malformed payloads uniformly.
export type ParsedDiscordInteraction = {
	/** Globally unique interaction id; used as the inbound-event dedup key. */
	id: string | null;
	type: number;
	/**
	 * Continuation token for the follow-up edit. Combined with `applicationId`
	 * it authenticates the `PATCH .../messages/@original` call that resolves the
	 * deferred "thinking" state (valid for 15 minutes, no bot token required).
	 */
	token: string | null;
	/** Discord application id (the webhook id for the follow-up edit). */
	applicationId: string | null;
	guildId: string | null;
	channelId: string | null;
	userId: string | null;
	commandName: string | null;
	text: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/**
 * Parses a raw Discord interaction body into a normalized shape.
 *
 * Discord nests the user under `member.user` (guild context) or top-level `user`
 * (DM context), and slash-command details under `data` (`data.name`, plus the
 * first string `option.value` as the user's text). Pure and total: returns
 * `null` only when `raw` is not an object; otherwise missing fields become null.
 */
export function parseDiscordInteraction(
	raw: unknown,
): ParsedDiscordInteraction | null {
	if (!isObject(raw)) {
		return null;
	}

	const type = typeof raw.type === "number" ? raw.type : null;
	if (type === null) {
		return null;
	}

	const id = asString(raw.id);
	const token = asString(raw.token);
	const applicationId = asString(raw.application_id);
	const guildId = asString(raw.guild_id);
	const channelId = asString(raw.channel_id);

	// User id lives under member.user.id (guild) or user.id (DM).
	let userId: string | null = null;
	if (isObject(raw.member) && isObject(raw.member.user)) {
		userId = asString(raw.member.user.id);
	}
	if (userId === null && isObject(raw.user)) {
		userId = asString(raw.user.id);
	}

	// Slash-command metadata.
	let commandName: string | null = null;
	let text: string | null = null;
	if (isObject(raw.data)) {
		commandName = asString(raw.data.name);

		// Take the first option carrying a string value as the command text.
		if (Array.isArray(raw.data.options)) {
			for (const option of raw.data.options) {
				if (isObject(option)) {
					const value = asString(option.value);
					if (value !== null) {
						text = value;
						break;
					}
				}
			}
		}
	}

	return {
		id,
		type,
		token,
		applicationId,
		guildId,
		channelId,
		userId,
		commandName,
		text,
	};
}
