// Auth
export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const ORGANIZATION_HEADER = "x-rox-organization-id";

// Deep link protocol schemes (used for desktop OAuth callbacks)
export const PROTOCOL_SCHEMES = {
	DEV: "rox-dev",
	PROD: "rox",
} as const;

// Company
export const COMPANY = {
	NAME: "Rox",
	DOMAIN: "rox.one",
	EMAIL_DOMAIN: "@rox.one",
	GITHUB_URL: "https://github.com/agisota/rox",
	DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.rox.one",
	MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL || "https://rox.one",
	TERMS_URL: `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://rox.one"}/terms`,
	PRIVACY_URL: `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://rox.one"}/privacy`,
	CHANGELOG_URL: `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://rox.one"}/changelog`,
	X_URL: "https://x.com/rox_sh",
	LINKEDIN_URL: "https://www.linkedin.com/company/agisota",
	YOUTUBE_URL: "https://www.youtube.com/@agisota",
	MAIL_TO: "mailto:founders@rox.one",
	REPORT_ISSUE_URL: "https://github.com/agisota/rox/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
	STATUS_URL: "https://status.rox.one",
	TRUST_URL: "https://trust.rox.one",
	CAREERS_URL: "https://www.ycombinator.com/companies/rox/jobs",
} as const;

// Theme
export const THEME_STORAGE_KEY = "rox-theme";

// Download URLs — stable-named assets attached to the latest desktop release.
export const DOWNLOAD_URL_MAC_ARM64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Rox-arm64.dmg`;
export const DOWNLOAD_URL_MAC_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Rox-x64.dmg`;
export const DOWNLOAD_URL_WIN_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Rox-x64.exe`;
export const DOWNLOAD_URL_LINUX = `${COMPANY.GITHUB_URL}/releases/latest/download/Rox-x86_64.AppImage`;

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
export const POSTHOG_COOKIE_NAME = "rox";

// OpenPanel (openpanel epic) — second analytics provider alongside PostHog.
export const OPENPANEL_COOKIE_NAME = "rox_op";

/**
 * Canonical analytics event names. Both the PostHog and OpenPanel emitters
 * key off these so dashboards/funnels stay aligned across providers. Keep in
 * sync with the typed catalog in `@rox/analytics` (`events.ts`).
 */
export const ANALYTICS_EVENTS = {
	PROJECT_CREATED: "project_created",
	WORKSPACE_CREATED: "workspace_created",
	REPO_CONNECTED: "repo_connected",
	PROMPT_SUBMITTED: "prompt_submitted",
	AGENT_RUN_STARTED: "agent_run_started",
	AGENT_RUN_COMPLETED: "agent_run_completed",
	AGENT_RUN_FAILED: "agent_run_failed",
	WORKFLOW_STARTED: "workflow_started",
	WORKFLOW_COMPLETED: "workflow_completed",
	WORKFLOW_FAILED: "workflow_failed",
	ARTIFACT_GENERATED: "artifact_generated",
	PRD_GENERATED: "prd_generated",
	PAYMENT_STARTED: "payment_started",
	PAYMENT_SUCCEEDED: "payment_succeeded",
	PAYMENT_FAILED: "payment_failed",
	ACCOUNT_CREATED: "account_created",
	SIGNED_IN: "signed_in",
	ONBOARDING_COMPLETED: "onboarding_completed",
	SESSION_STARTED: "session_started",
} as const;

export type AnalyticsEventName =
	(typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// Users whose account was created within the window
// [V2_ONLY_USER_CUTOFF, V2_NEW_USER_V1_EXPERIMENT_START) are v2-only: the v1↔v2
// surface switch is hidden and v2 cloud is forced on. Pre-cutoff users keep the
// existing opt-in toggle. Accounts created at or after the experiment start are
// sent to v1 (the new-users-v1 experiment) and are never forced into v2. Stored
// as ISO strings so the values are identical on server, desktop renderer, web,
// and admin.
// 2026-05-15 14:00 UTC = Fri 07:00 PDT / 10:00 EDT.
export const V2_ONLY_USER_CUTOFF = "2026-05-15T14:00:00.000Z";
// 2026-06-08 06:59 UTC = Sun 23:59 PDT (11:59pm Pacific).
export const V2_NEW_USER_V1_EXPERIMENT_START = "2026-06-08T06:59:00.000Z";

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
	 * Routes the Slack agent to the v2 MCP server (`@rox/mcp-v2`)
	 * instead of v1 (`@rox/mcp`). Evaluated against the linking
	 * user's id (the Rox user behind the Slack mention) so it
	 * piggybacks on the existing All Access cohort. Off → v1.
	 */
	SLACK_MCP_V2: "slack-mcp-v2",
	/**
	 * Per-user override for the relay base URL. Payload shape:
	 * `{ "url": "https://..." }`. When set, both the host-service tunnel and
	 * the desktop renderer's client-side WS opens route through this URL
	 * instead of `env.RELAY_URL`. Lets us A/B-test alternative relay
	 * implementations (e.g. Cloudflare Durable Objects) without changing
	 * defaults for other users.
	 */
	RELAY_URL_OVERRIDE: "relay-url-override",
	/**
	 * Gates the Network Filter / Managed DNS settings surface (WS-N). The actual
	 * NextDNS wiring lands separately (`plans/2026-06-18-managed-nextdns-profile.md`);
	 * this flag exposes the gated shell. Resolved override-first via the
	 * `user_feature_flags` table (WS-O), falling back to a PostHog rollout cohort —
	 * so "developer-id gating" = an admin force-on row for the owner's user id.
	 */
	NETWORK_FILTER: "network-filter",
	/**
	 * Explicit per-user gate for the remote-agent / automation surface (WS-N).
	 * Complements `DISABLE_REMOTE_AGENT` (the kill-switch) by letting the owner
	 * promote the automation watcher from cohort-only to an explicit opt-in key.
	 * Same override-first resolution as the other keys; no schema change needed.
	 */
	AUTOMATION_ACCESS: "automation-access",
} as const;
