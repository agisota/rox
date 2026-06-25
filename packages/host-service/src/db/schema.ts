import type { BranchPrefixMode } from "@rox/shared/workspace-launch";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const terminalSessions = sqliteTable(
	"terminal_sessions",
	{
		id: text().primaryKey(),
		originWorkspaceId: text("origin_workspace_id").references(
			() => workspaces.id,
			{ onDelete: "set null" },
		),
		status: text().notNull().default("active"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastAttachedAt: integer("last_attached_at"),
		endedAt: integer("ended_at"),
	},
	(table) => [
		index("terminal_sessions_origin_workspace_id_idx").on(
			table.originWorkspaceId,
		),
		index("terminal_sessions_status_idx").on(table.status),
	],
);

/**
 * Sync state of a local-first entity's cloud mirror. `pending` = enqueued in
 * `sync_outbox`, not yet acked; `synced` = cloud row linked (`cloudId` set);
 * `error` = last drain attempt failed (transient — flips back to synced on the
 * next successful drain). Only meaningful when the `localFirstCreate` host
 * setting is on; the synchronous-cloud path leaves rows `synced`-by-construction
 * (it never inserts a local row without the matching cloud row).
 */
export type EntitySyncState = "pending" | "synced" | "error";

export const projects = sqliteTable(
	"projects",
	{
		id: text().primaryKey(),
		repoPath: text("repo_path").notNull(),
		repoProvider: text("repo_provider"),
		repoOwner: text("repo_owner"),
		repoName: text("repo_name"),
		repoUrl: text("repo_url"),
		remoteName: text("remote_name"),
		worktreeBaseDir: text("worktree_base_dir"),
		// Per-project branch-prefix override. A null `branchPrefixMode` means
		// "fall back to the host-wide default" in `host_settings`.
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		// Local-first cloud link. `cloudId` is the cloud `v2Project` id once the
		// outbox worker links it (null until then; in the local-first path it
		// equals the local `id`, which is forwarded as the cloud-supplied id).
		// `syncState` defaults to `synced` so the existing synchronous-cloud path
		// — which only ever inserts a project row alongside its cloud row — is
		// correct without touching this column. The local-first path explicitly
		// writes `pending`.
		cloudId: text("cloud_id"),
		syncState: text("sync_state")
			.$type<EntitySyncState>()
			.notNull()
			.default("synced"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("projects_repo_path_idx").on(table.repoPath)],
);

/**
 * Single-row host-wide settings (always `id = 1`). The host-service has no
 * generic settings store yet; this row holds host-wide knobs (worktree base
 * dir, branch-prefix default) that projects fall back to when they have no
 * override of their own.
 */
export const hostSettings = sqliteTable("host_settings", {
	id: integer().primaryKey().default(1),
	worktreeBaseDir: text("worktree_base_dir"),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
	// Root dir new projects are created under (mirrors `worktreeBaseDir`). Null
	// resolves to the default `~/rox` at read time, so upgraders are unaffected.
	projectsBaseDir: text("projects_base_dir"),
	// Local-first create safety flag. Null/false = today's synchronous-cloud
	// create with rollback-on-failure (the proven default). True = instant local
	// create + background cloud sync via the outbox. Defaults OFF so a
	// HIGH-blast-radius core-path change never ships enabled-by-default; the
	// maintainer flips this one row to roll it out.
	localFirstCreate: integer("local_first_create", { mode: "boolean" }),
	// Whether create auto-runs `git init` for a folder that isn't a repo yet.
	// Null resolves to true (today's behavior: empty/template always init).
	autoInitGit: integer("auto_init_git", { mode: "boolean" }),
	// Role→model routing (Ф3, #508): JSON `Record<AgentRole, {agentId, modelId}>`
	// for the 5 orchestration roles. Null/invalid resolves to the all-ROX/ROX
	// default at read time (`getHostRoleModelMapping`), so a fresh row and every
	// upgrader run on ROX/ROX with zero config.
	roleModelMappingJson: text("role_model_mapping_json"),
});

export const pullRequests = sqliteTable(
	"pull_requests",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		repoProvider: text("repo_provider").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		prNumber: integer("pr_number").notNull(),
		url: text().notNull(),
		title: text().notNull(),
		state: text().notNull(),
		isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
		headBranch: text("head_branch").notNull(),
		headSha: text("head_sha").notNull(),
		reviewDecision: text("review_decision"),
		checksStatus: text("checks_status").notNull().default("none"),
		checksJson: text("checks_json").notNull().default("[]"),
		lastFetchedAt: integer("last_fetched_at"),
		error: text(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("pull_requests_project_id_idx").on(table.projectId),
		index("pull_requests_repo_branch_idx").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.headBranch,
		),
		uniqueIndex("pull_requests_repo_pr_unique").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.prNumber,
		),
	],
);

export const hostAgentConfigs = sqliteTable(
	"host_agent_configs",
	{
		id: text().primaryKey(),
		presetId: text("preset_id").notNull(),
		label: text().notNull(),
		command: text().notNull(),
		argsJson: text("args_json").notNull().default("[]"),
		promptTransport: text("prompt_transport").notNull(),
		promptArgsJson: text("prompt_args_json").notNull().default("[]"),
		envJson: text("env_json").notNull().default("{}"),
		displayOrder: integer("display_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("host_agent_configs_display_order_idx").on(table.displayOrder),
	],
);

/**
 * Status of preinstalling a bundled terminal agent or harness on this host.
 * One row per catalog `preset_id` (a builtin agent id or harness id). Lets
 * the preinstall runtime stay idempotent across restarts and lets the
 * renderer surface per-agent progress and retry failed installs.
 */
export type AgentInstallStatus =
	| "pending"
	| "installing"
	| "installed"
	| "failed"
	| "skipped";

export const agentInstallState = sqliteTable(
	"agent_install_state",
	{
		// `preset_id` is the natural key (builtin agent id or harness id), so a
		// reconcile that re-seeds the catalog can upsert without duplicating.
		presetId: text("preset_id").primaryKey(),
		// "agent" | "harness" — kept as free text to avoid a migration when a
		// future catalog kind shows up.
		kind: text().notNull().default("agent"),
		status: text().$type<AgentInstallStatus>().notNull().default("pending"),
		// Resolved binary/harness version once installed, when known.
		version: text(),
		lastError: text("last_error"),
		installedAt: integer("installed_at"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("agent_install_state_status_idx").on(table.status)],
);

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		worktreePath: text("worktree_path").notNull(),
		branch: text().notNull(),
		headSha: text("head_sha"),
		upstreamOwner: text("upstream_owner"),
		upstreamRepo: text("upstream_repo"),
		upstreamBranch: text("upstream_branch"),
		pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
			onDelete: "set null",
		}),
		// Local-first cloud link (see `projects.cloudId` / `projects.syncState`).
		// `syncState` defaults to `synced` so the existing strict path — which
		// inserts the local workspace row with the cloud-assigned id — is correct
		// untouched; the local-first path writes a local id + `pending`.
		cloudId: text("cloud_id"),
		syncState: text("sync_state")
			.$type<EntitySyncState>()
			.notNull()
			.default("synced"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_upstream_ref_idx").on(
			table.upstreamOwner,
			table.upstreamRepo,
			table.upstreamBranch,
		),
		index("workspaces_pull_request_id_idx").on(table.pullRequestId),
	],
);

/**
 * Durable local-first cloud-create outbox. When the `localFirstCreate` host
 * setting is on, project/workspace create enqueues the cloud `v2Project.create`
 * / `v2Workspace.create` here instead of calling them synchronously; the
 * `OutboxSyncManager` worker drains pending rows when the cloud is reachable,
 * links the returned cloud id onto the local row, then deletes the row.
 *
 * Idempotency: `dedupKey` is unique, so enqueue is `onConflictDoNothing` and a
 * crash-and-retry re-processes the SAME row rather than double-creating in the
 * cloud. `kind` discriminates the payload; `nextAttemptAt` gates exponential
 * backoff; `attempts`/`lastError` carry retry diagnostics.
 */
export type SyncOutboxKind = "project.create" | "workspace.create";

export const syncOutbox = sqliteTable(
	"sync_outbox",
	{
		id: text().primaryKey(),
		kind: text().$type<SyncOutboxKind>().notNull(),
		dedupKey: text("dedup_key").notNull(),
		payloadJson: text("payload_json").notNull(),
		attempts: integer().notNull().default(0),
		lastError: text("last_error"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		// Backoff gate: a row is eligible to drain only when `nextAttemptAt <=
		// now`. Defaults to 0 so a freshly-enqueued row drains immediately.
		nextAttemptAt: integer("next_attempt_at").notNull().default(0),
	},
	(table) => [
		uniqueIndex("sync_outbox_dedup_key_unique").on(table.dedupKey),
		index("sync_outbox_next_attempt_at_idx").on(table.nextAttemptAt),
	],
);

export const canvasDocuments = sqliteTable(
	"canvas_documents",
	{
		id: text().primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		title: text().notNull(),
		revision: integer().notNull().default(0),
		path: text().notNull(),
		nodeCount: integer("node_count").notNull().default(0),
		edgeCount: integer("edge_count").notNull().default(0),
		groupCount: integer("group_count").notNull().default(0),
		nodeTypesJson: text("node_types_json").notNull().default("{}"),
		refsJson: text("refs_json").notNull().default("[]"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("canvas_documents_workspace_id_idx").on(table.workspaceId),
		index("canvas_documents_updated_at_idx").on(table.updatedAt),
	],
);
