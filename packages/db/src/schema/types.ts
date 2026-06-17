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
