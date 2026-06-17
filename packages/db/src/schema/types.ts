export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
};

export type TelegramConfig = {
	provider: "telegram";
	/** Telegram bot username (e.g. `@my_rox_bot`), shown in the UI. */
	botUsername?: string;
	/** Default chat the bot replies in, if pinned to a single conversation. */
	defaultChatId?: string;
	/**
	 * Per-connection secret registered with Telegram via `setWebhook`
	 * (`secret_token`). Telegram echoes it back on every update in the
	 * `X-Telegram-Bot-Api-Secret-Token` header; the inbound webhook matches it to
	 * resolve the originating org. Stored in jsonb `config` — TYPE-only addition,
	 * no table/migration change.
	 */
	webhookSecret?: string;
	/** Resolved chat id captured from the first inbound message, if known. */
	chatId?: number;
};

export type DiscordConfig = {
	provider: "discord";
	/** Guild (server) the bot was installed into. */
	guildId?: string;
	/** Default channel for outbound messages. */
	defaultChannelId?: string;
	/** Discord application id, used to build the interactions endpoint URL. */
	applicationId?: string;
};

export type NotionConfig = {
	provider: "notion";
	/** Notion workspace name returned by the OAuth grant. */
	workspaceName?: string;
	/** Bot user id of the granted integration. */
	botId?: string;
};

export type ObsidianConfig = {
	provider: "obsidian";
	/** Vault name as reported by the local REST plugin. */
	vaultName?: string;
};

export type FiberyConfig = {
	provider: "fibery";
	/** Fibery account subdomain (e.g. `acme` for `acme.fibery.io`). */
	account?: string;
};

export type LarkConfig = {
	provider: "lark";
	/** Tenant key the app was installed for. */
	tenantKey?: string;
	/** App ID (`cli_...`) used to resolve the org from inbound event callbacks. */
	appId?: string;
	/**
	 * Event-subscription verification token (plaintext mode). Lark echoes this in
	 * every callback; the inbound events route uses it to authenticate requests.
	 */
	verificationToken?: string;
};

export type IntegrationConfig =
	| LinearConfig
	| SlackConfig
	| TelegramConfig
	| DiscordConfig
	| NotionConfig
	| ObsidianConfig
	| FiberyConfig
	| LarkConfig;
