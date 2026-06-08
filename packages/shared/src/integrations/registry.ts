/**
 * Single source of truth for the integration provider catalog.
 *
 * Drives the web integrations catalog and any place that needs provider
 * metadata (name, category, brand color, auth model, capabilities) without
 * reaching into the DB layer. Kept dependency-free so it can be imported from
 * both server and client bundles.
 *
 * The provider ids here MUST stay in sync with `integrationProviderValues` in
 * `@rox/db/schema` (the Postgres enum). A compile-time check in the consuming
 * packages guards drift.
 */

/** How a provider is connected. */
export type IntegrationAuthKind =
	| "oauth" // hosted OAuth2 authorization-code flow (Linear, Notion, Lark, Fibery)
	| "bot_token" // user pastes a long-lived bot token (Telegram)
	| "bot_oauth" // OAuth install that yields a bot identity (Slack, Discord)
	| "local"; // no hosted auth; local REST/token only (Obsidian)

/** What a provider can do once connected. */
export interface IntegrationCapabilities {
	/** Receives events/messages from the provider (webhooks, polling). */
	inbound: boolean;
	/** Sends messages/actions back to the provider. */
	outbound: boolean;
	/** Performs bulk/scheduled data sync. */
	sync: boolean;
}

export type IntegrationCategory =
	| "Task Management"
	| "Version Control"
	| "Communication"
	| "Knowledge";

export interface IntegrationProviderMeta {
	id: string;
	name: string;
	description: string;
	category: IntegrationCategory;
	/** Brand accent color used by the catalog card spotlight. */
	accentColor: string;
	authKind: IntegrationAuthKind;
	capabilities: IntegrationCapabilities;
	/** False while the vertical is still landing; renders a "Coming Soon" card. */
	enabled: boolean;
}

export const integrationRegistry = {
	linear: {
		id: "linear",
		name: "Linear",
		description: "Sync issues bidirectionally with Linear.",
		category: "Task Management",
		accentColor: "#5E6AD2",
		authKind: "oauth",
		capabilities: { inbound: true, outbound: true, sync: true },
		enabled: true,
	},
	github: {
		id: "github",
		name: "GitHub",
		description: "Connect repos and sync pull requests.",
		category: "Version Control",
		accentColor: "#238636",
		authKind: "oauth",
		capabilities: { inbound: true, outbound: true, sync: true },
		enabled: true,
	},
	slack: {
		id: "slack",
		name: "Slack",
		description: "Connect Slack to manage tasks from conversations.",
		category: "Communication",
		accentColor: "#4A154B",
		authKind: "bot_oauth",
		capabilities: { inbound: true, outbound: true, sync: false },
		enabled: true,
	},
	telegram: {
		id: "telegram",
		name: "Telegram",
		description: "Drive agents from a Telegram bot in any chat.",
		category: "Communication",
		accentColor: "#229ED9",
		authKind: "bot_token",
		capabilities: { inbound: true, outbound: true, sync: false },
		enabled: true,
	},
	discord: {
		id: "discord",
		name: "Discord",
		description: "Install a bot and run agents from your server.",
		category: "Communication",
		accentColor: "#5865F2",
		authKind: "bot_oauth",
		capabilities: { inbound: true, outbound: true, sync: false },
		enabled: true,
	},
	notion: {
		id: "notion",
		name: "Notion",
		description: "Sync docs and databases with your Notion workspace.",
		category: "Knowledge",
		accentColor: "#000000",
		authKind: "oauth",
		capabilities: { inbound: false, outbound: true, sync: true },
		enabled: true,
	},
	obsidian: {
		id: "obsidian",
		name: "Obsidian",
		description: "Sync notes with a local Obsidian vault.",
		category: "Knowledge",
		accentColor: "#7C3AED",
		authKind: "local",
		capabilities: { inbound: false, outbound: false, sync: true },
		enabled: true,
	},
	fibery: {
		id: "fibery",
		name: "Fibery",
		description: "Connect a Fibery workspace with a per-account token.",
		category: "Task Management",
		accentColor: "#9D6EE3",
		authKind: "oauth",
		capabilities: { inbound: true, outbound: true, sync: true },
		enabled: true,
	},
	lark: {
		id: "lark",
		name: "Lark",
		description: "Connect Lark (Feishu) for messaging and docs.",
		category: "Communication",
		accentColor: "#00D6B9",
		authKind: "oauth",
		capabilities: { inbound: true, outbound: true, sync: true },
		enabled: true,
	},
} satisfies Record<string, IntegrationProviderMeta>;

export type IntegrationRegistryId = keyof typeof integrationRegistry;

/** Ordered list for rendering the catalog grid. */
export const integrationCatalog: IntegrationProviderMeta[] =
	Object.values(integrationRegistry);

export function getIntegrationMeta(
	id: IntegrationRegistryId,
): IntegrationProviderMeta {
	return integrationRegistry[id];
}
