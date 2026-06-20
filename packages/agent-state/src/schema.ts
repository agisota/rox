import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * libSQL (SQLite-dialect) schema for the cross-host agent-state primary.
 *
 * This is a SEPARATE database from `packages/db` (Neon Postgres / Electric) and
 * from `packages/local-db` (renderer cache). It carries only convergent,
 * observable agent coordination state synced via Turso/libSQL embedded replicas.
 * Migrations for this schema live under `packages/agent-state/drizzle/` and are
 * generated offline with `drizzle-kit generate` — NEVER under `packages/db`.
 */

/** Convergent key/value coordination entries, LWW per (org, scope, scope_id, key). */
export const agentStateEntries = sqliteTable(
	"agent_state_entries",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id").notNull(),
		/** Origin host that authored the current revision. */
		deviceId: text("device_id").notNull(),
		/** workspace | run | host */
		scope: text("scope").notNull(),
		scopeId: text("scope_id").notNull(),
		key: text("key").notNull(),
		valueJson: text("value_json").notNull(),
		/** Monotonic per-key revision (lamport-ish) for LWW resolution. */
		revision: integer("revision").notNull().default(0),
		updatedAt: integer("updated_at").notNull().default(0),
	},
	(table) => [
		uniqueIndex("agent_state_entries_org_scope_key_uniq").on(
			table.orgId,
			table.scope,
			table.scopeId,
			table.key,
		),
		index("agent_state_entries_scope_idx").on(
			table.orgId,
			table.scope,
			table.scopeId,
		),
	],
);

/** Per-host liveness. */
export const hostPresence = sqliteTable(
	"host_presence",
	{
		deviceId: text("device_id").primaryKey(),
		orgId: text("org_id").notNull(),
		machineId: text("machine_id").notNull(),
		/** local | cloud */
		hostKind: text("host_kind").notNull(),
		/** online | draining | offline */
		state: text("state").notNull().default("offline"),
		lastSeenAt: integer("last_seen_at").notNull().default(0),
		updatedAt: integer("updated_at").notNull().default(0),
	},
	(table) => [index("host_presence_org_idx").on(table.orgId)],
);

/** Per-run coordination: progress, ownership, heartbeat. */
export const agentRunCoord = sqliteTable(
	"agent_run_coord",
	{
		runId: text("run_id").primaryKey(),
		orgId: text("org_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		ownerDevice: text("owner_device").notNull(),
		step: integer("step").notNull().default(0),
		status: text("status").notNull().default("pending"),
		heartbeatAt: integer("heartbeat_at").notNull().default(0),
		updatedAt: integer("updated_at").notNull().default(0),
	},
	(table) => [
		index("agent_run_coord_workspace_idx").on(table.orgId, table.workspaceId),
	],
);

/**
 * Idempotent DDL mirroring the schema above, applied at runtime when a replica
 * opens against a fresh/empty database. The drizzle migrator is Postgres-only in
 * this repo, so libSQL replicas bootstrap their own tables via these statements.
 * `drizzle-kit generate` still emits the canonical migration files under
 * `packages/agent-state/drizzle/` from the table definitions above.
 */
export const AGENT_STATE_DDL: string[] = [
	`CREATE TABLE IF NOT EXISTS agent_state_entries (
	id TEXT PRIMARY KEY NOT NULL,
	org_id TEXT NOT NULL,
	device_id TEXT NOT NULL,
	scope TEXT NOT NULL,
	scope_id TEXT NOT NULL,
	key TEXT NOT NULL,
	value_json TEXT NOT NULL,
	revision INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS agent_state_entries_org_scope_key_uniq
	ON agent_state_entries (org_id, scope, scope_id, key)`,
	`CREATE INDEX IF NOT EXISTS agent_state_entries_scope_idx
	ON agent_state_entries (org_id, scope, scope_id)`,
	`CREATE TABLE IF NOT EXISTS host_presence (
	device_id TEXT PRIMARY KEY NOT NULL,
	org_id TEXT NOT NULL,
	machine_id TEXT NOT NULL,
	host_kind TEXT NOT NULL,
	state TEXT NOT NULL DEFAULT 'offline',
	last_seen_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE INDEX IF NOT EXISTS host_presence_org_idx ON host_presence (org_id)`,
	`CREATE TABLE IF NOT EXISTS agent_run_coord (
	run_id TEXT PRIMARY KEY NOT NULL,
	org_id TEXT NOT NULL,
	workspace_id TEXT NOT NULL,
	owner_device TEXT NOT NULL,
	step INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'pending',
	heartbeat_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE INDEX IF NOT EXISTS agent_run_coord_workspace_idx
	ON agent_run_coord (org_id, workspace_id)`,
];

export type AgentStateEntryRow = typeof agentStateEntries.$inferSelect;
export type HostPresenceRow = typeof hostPresence.$inferSelect;
export type AgentRunCoordRow = typeof agentRunCoord.$inferSelect;
