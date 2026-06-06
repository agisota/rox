// Auth
export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const ORGANIZATION_HEADER = "x-superset-organization-id";

// Deep link protocol schemes (used for desktop OAuth callbacks)
export const PROTOCOL_SCHEMES = {
	DEV: "superset-dev",
	PROD: "superset",
} as const;

// Company
const DEFAULT_DOMAIN = "set.t";
const DEFAULT_GITHUB_OWNER = "agisota";
const DEFAULT_GITHUB_REPO = "set";
const DEFAULT_GITHUB_URL = `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}`;
const DEFAULT_MARKETING_URL = DEFAULT_GITHUB_URL;
const DEFAULT_API_URL = `https://api.${DEFAULT_DOMAIN}`;
const DEFAULT_WEB_URL = `https://app.${DEFAULT_DOMAIN}`;
const DEFAULT_STREAMS_URL = `https://streams.${DEFAULT_DOMAIN}`;
const DEFAULT_RELAY_URL = `https://relay.${DEFAULT_DOMAIN}`;
const DEFAULT_RELAY_BACKUP_URL = `https://relay-backup.${DEFAULT_DOMAIN}`;
const DEFAULT_ELECTRIC_URL = `https://electric.${DEFAULT_DOMAIN}`;
const DEFAULT_DOCS_URL = `${DEFAULT_GITHUB_URL}#readme`;
const MARKETING_URL =
	process.env.NEXT_PUBLIC_MARKETING_URL || DEFAULT_MARKETING_URL;
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || DEFAULT_DOCS_URL;
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL || DEFAULT_GITHUB_URL;

export const DEFAULT_HTML_LANG = "ru";
export const DEFAULT_LOCALE = "ru-RU";
export const DEFAULT_OPEN_GRAPH_LOCALE = "ru_RU";

export const COMPANY = {
	NAME: process.env.NEXT_PUBLIC_COMPANY_NAME || "Станция Агентов",
	LEGAL_NAME: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME || "Станция Агентов",
	DOMAIN: process.env.NEXT_PUBLIC_COMPANY_DOMAIN || DEFAULT_DOMAIN,
	EMAIL_DOMAIN: process.env.NEXT_PUBLIC_EMAIL_DOMAIN || `@${DEFAULT_DOMAIN}`,
	GITHUB_OWNER: process.env.NEXT_PUBLIC_GITHUB_OWNER || DEFAULT_GITHUB_OWNER,
	GITHUB_REPO: process.env.NEXT_PUBLIC_GITHUB_REPO || DEFAULT_GITHUB_REPO,
	DESCRIPTION_SHORT: "Запускайте несколько агентов разработки на своей машине",
	DESCRIPTION_LONG:
		"Создавайте отдельные задачи, запускайте параллельные рабочие среды и быстро переключайтесь между ними, когда нужна ваша проверка.",
	GITHUB_URL: process.env.NEXT_PUBLIC_GITHUB_URL || DEFAULT_GITHUB_URL,
	DOCS_URL,
	MARKETING_URL,
	TERMS_URL: process.env.NEXT_PUBLIC_TERMS_URL || `${MARKETING_URL}/terms`,
	PRIVACY_URL:
		process.env.NEXT_PUBLIC_PRIVACY_URL || `${MARKETING_URL}/privacy`,
	CHANGELOG_URL:
		process.env.NEXT_PUBLIC_CHANGELOG_URL || `${MARKETING_URL}/changelog`,
	X_URL: process.env.NEXT_PUBLIC_X_URL || `${MARKETING_URL}/news`,
	X_HANDLE: process.env.NEXT_PUBLIC_X_HANDLE || "",
	LINKEDIN_URL:
		process.env.NEXT_PUBLIC_LINKEDIN_URL || `${MARKETING_URL}/company`,
	YOUTUBE_URL: process.env.NEXT_PUBLIC_YOUTUBE_URL || `${MARKETING_URL}/video`,
	MAIL_TO: SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}` : SUPPORT_URL,
	REPORT_ISSUE_URL:
		process.env.NEXT_PUBLIC_REPORT_ISSUE_URL ||
		`${DEFAULT_GITHUB_URL}/issues/new`,
	DISCORD_URL:
		process.env.NEXT_PUBLIC_DISCORD_URL || `${MARKETING_URL}/community`,
	STATUS_URL: process.env.NEXT_PUBLIC_STATUS_URL || `${MARKETING_URL}/status`,
	TRUST_URL: process.env.NEXT_PUBLIC_TRUST_URL || `${MARKETING_URL}/trust`,
	CAREERS_URL:
		process.env.NEXT_PUBLIC_CAREERS_URL || `${MARKETING_URL}/careers`,
} as const;

export const APP_RELEASE_BASENAME =
	process.env.NEXT_PUBLIC_APP_RELEASE_BASENAME || "Set";

export const SERVICE_URLS = {
	API: process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL,
	WEB: process.env.NEXT_PUBLIC_WEB_URL || DEFAULT_WEB_URL,
	MARKETING: MARKETING_URL,
	DOCS: DOCS_URL,
	STREAMS: process.env.NEXT_PUBLIC_STREAMS_URL || DEFAULT_STREAMS_URL,
	RELAY: process.env.RELAY_URL || DEFAULT_RELAY_URL,
	RELAY_BACKUP:
		process.env.NEXT_PUBLIC_RELAY_BACKUP_URL || DEFAULT_RELAY_BACKUP_URL,
	ELECTRIC: process.env.NEXT_PUBLIC_ELECTRIC_URL || DEFAULT_ELECTRIC_URL,
} as const;

// Theme
export const THEME_STORAGE_KEY = "superset-theme";

// Download URLs
export const DOWNLOAD_URL_MAC_ARM64 = `${COMPANY.GITHUB_URL}/releases/latest/download/${APP_RELEASE_BASENAME}-arm64.dmg`;
export const DOWNLOAD_URL_MAC_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/${APP_RELEASE_BASENAME}-x64.dmg`;

// Auth token configuration
export const TOKEN_CONFIG = {
	/** Access token lifetime in seconds (1 hour) */
	ACCESS_TOKEN_EXPIRY: 60 * 60,
	/** Refresh token lifetime in seconds (30 days) */
	REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60,
	/** Refresh access token when this many seconds remain (5 minutes) */
	REFRESH_THRESHOLD: 5 * 60,
} as const;

// Workspace teardown
export const TEARDOWN_TIMEOUT_MS = 60_000;

// PostHog
export const POSTHOG_COOKIE_NAME = "superset";

// Users whose account was created at or after this instant are v2-only:
// the v1↔v2 surface switch is hidden and v2 cloud is forced on. Pre-cutoff
// users keep the existing opt-in toggle. Stored as an ISO string so the
// value is identical on server, desktop renderer, web, and admin.
// 2026-05-15 14:00 UTC = Fri 07:00 PDT / 10:00 EDT.
export const V2_ONLY_USER_CUTOFF = "2026-05-15T14:00:00.000Z";

export const FEATURE_FLAGS = {
	/** Gates access to experimental Electric SQL tasks feature. */
	ELECTRIC_TASKS_ACCESS: "electric-tasks-access",
	/** Gates access to the experimental mobile-first agents UI on web. */
	WEB_AGENTS_UI_ACCESS: "web-agents-ui-access",
	/** Gates access to GitHub integration (currently buggy, internal only). */
	GITHUB_INTEGRATION_ACCESS: "github-integration-access",
	/** Gates access to Cloud features (environment variables, sandboxes). */
	CLOUD_ACCESS: "cloud-access",
	/** When enabled, blocks remote agent execution on the desktop (e.g., for enterprise orgs). */
	DISABLE_REMOTE_AGENT: "disable-remote-agent",
	/**
	 * Routes the Slack agent to the v2 MCP server (`@superset/mcp-v2`)
	 * instead of v1 (`@superset/mcp`). Evaluated against the linking
	 * user's id (the platform user behind the Slack mention) so it
	 * piggybacks on the existing All Access cohort. Off → v1.
	 */
	SLACK_MCP_V2: "slack-mcp-v2",
	/**
	 * Gates the v2 desktop terminal's "Share remote control" button.
	 * Evaluated against the sharer's platform user id — anyone with the
	 * resulting share link can still open it (the per-session HMAC is
	 * the credential), so this only controls who can START a session.
	 */
	WEB_REMOTE_CONTROL_ACCESS: "web-remote-control-access",
	/**
	 * Per-user override for the relay base URL. Payload shape:
	 * `{ "url": "https://..." }`. When set, both the host-service tunnel and
	 * the desktop renderer's client-side WS opens route through this URL
	 * instead of `env.RELAY_URL`. Lets us A/B-test alternative relay
	 * implementations (e.g. Cloudflare Durable Objects) without changing
	 * defaults for other users.
	 */
	RELAY_URL_OVERRIDE: "relay-url-override",
} as const;
