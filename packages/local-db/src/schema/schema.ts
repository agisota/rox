import type {
	CircuitValidationResult,
	ExecutionCircuitSpec,
	ExecutionCircuitStatus,
	ExecutionMonadSpec,
	RuntimeBindingSpec,
	TraceEventPayload,
	TransitionRunOutput,
	TransitionRunStatus,
	TransitionValidationResult,
} from "@superset/shared/execution-circuit";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

import type {
	AgentCustomDefinition,
	AgentPresetOverrideEnvelope,
	BranchPrefixMode,
	ExternalApp,
	FileOpenMode,
	GitHubStatus,
	GitStatus,
	TerminalLinkBehavior,
	TerminalPreset,
	WorkspaceType,
} from "./zod";

/**
 * Projects table - represents a git repository that the user has opened
 */
export const projects = sqliteTable(
	"projects",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		mainRepoPath: text("main_repo_path").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		tabOrder: integer("tab_order"),
		lastOpenedAt: integer("last_opened_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		configToastDismissed: integer("config_toast_dismissed", {
			mode: "boolean",
		}),
		defaultBranch: text("default_branch"),
		workspaceBaseBranch: text("workspace_base_branch"),
		githubOwner: text("github_owner"),
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		worktreeBaseDir: text("worktree_base_dir"),
		hideImage: integer("hide_image", { mode: "boolean" }),
		iconUrl: text("icon_url"),
		neonProjectId: text("neon_project_id"),
		defaultApp: text("default_app").$type<ExternalApp>(),
	},
	(table) => [
		index("projects_main_repo_path_idx").on(table.mainRepoPath),
		index("projects_last_opened_at_idx").on(table.lastOpenedAt),
	],
);

export type InsertProject = typeof projects.$inferInsert;
export type SelectProject = typeof projects.$inferSelect;

/**
 * Worktrees table - represents a git worktree within a project
 */
export const worktrees = sqliteTable(
	"worktrees",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		branch: text("branch").notNull(),
		baseBranch: text("base_branch"), // The branch this worktree was created from
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		gitStatus: text("git_status", { mode: "json" }).$type<GitStatus>(),
		githubStatus: text("github_status", { mode: "json" }).$type<GitHubStatus>(),
		// Track whether this worktree was created by Superset or imported from external source
		// Used to prevent accidental deletion of user-created worktrees
		createdBySuperset: integer("created_by_superset", { mode: "boolean" })
			.notNull()
			.default(true),
	},
	(table) => [
		index("worktrees_project_id_idx").on(table.projectId),
		index("worktrees_branch_idx").on(table.branch),
	],
);

export type InsertWorktree = typeof worktrees.$inferInsert;
export type SelectWorktree = typeof worktrees.$inferSelect;

/**
 * Workspaces table - represents an active workspace (worktree or branch-based)
 */
export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		worktreeId: text("worktree_id").references(() => worktrees.id, {
			onDelete: "cascade",
		}), // Only set for type="worktree"
		type: text("type").notNull().$type<WorkspaceType>(),
		branch: text("branch").notNull(), // Branch name for both types
		name: text("name").notNull(),
		tabOrder: integer("tab_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastOpenedAt: integer("last_opened_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		isUnread: integer("is_unread", { mode: "boolean" }).default(false),
		// Whether the workspace has an auto-generated name (branch name) that should prompt for rename
		isUnnamed: integer("is_unnamed", { mode: "boolean" }).default(false),
		// Timestamp when deletion was initiated. Non-null means deletion in progress.
		// Workspaces with deletingAt set should be filtered out from queries.
		deletingAt: integer("deleting_at"),
		// Allocated port base for multi-worktree dev instances.
		// Each workspace gets a range of 10 ports starting from this base.
		portBase: integer("port_base"),
		sectionId: text("section_id").references(() => workspaceSections.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_worktree_id_idx").on(table.worktreeId),
		index("workspaces_last_opened_at_idx").on(table.lastOpenedAt),
		index("workspaces_section_id_idx").on(table.sectionId),
		// NOTE: Migration 0006 creates an additional partial unique index:
		// CREATE UNIQUE INDEX workspaces_unique_branch_per_project
		//   ON workspaces(project_id) WHERE type = 'branch'
		// This enforces one branch workspace per project. Drizzle's schema DSL
		// doesn't support partial/filtered indexes, so this constraint is only
		// applied via the migration, not schema push. See migration 0006 for details.
	],
);

export type InsertWorkspace = typeof workspaces.$inferInsert;
export type SelectWorkspace = typeof workspaces.$inferSelect;

/**
 * Workspace sections - user-created groups within a project for organizing workspaces
 */
export const workspaceSections = sqliteTable(
	"workspace_sections",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tabOrder: integer("tab_order").notNull(),
		isCollapsed: integer("is_collapsed", { mode: "boolean" }).default(false),
		color: text("color"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("workspace_sections_project_id_idx").on(table.projectId)],
);

export type InsertWorkspaceSection = typeof workspaceSections.$inferInsert;
export type SelectWorkspaceSection = typeof workspaceSections.$inferSelect;

export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey().default(1),
	lastActiveWorkspaceId: text("last_active_workspace_id"),
	terminalPresets: text("terminal_presets", { mode: "json" }).$type<
		TerminalPreset[]
	>(),
	terminalPresetsInitialized: integer("terminal_presets_initialized", {
		mode: "boolean",
	}),
	agentPresetOverrides: text("agent_preset_overrides", {
		mode: "json",
	}).$type<AgentPresetOverrideEnvelope>(),
	agentCustomDefinitions: text("agent_custom_definitions", {
		mode: "json",
	}).$type<AgentCustomDefinition[]>(),
	agentPresetPermissionsMigratedAt: integer(
		"agent_preset_permissions_migrated_at",
	),
	selectedRingtoneId: text("selected_ringtone_id"),
	activeOrganizationId: text("active_organization_id"),
	confirmOnQuit: integer("confirm_on_quit", { mode: "boolean" }),
	terminalLinkBehavior: text(
		"terminal_link_behavior",
	).$type<TerminalLinkBehavior>(),
	terminalPersistence: integer("persist_terminal", { mode: "boolean" }).default(
		true,
	),
	autoApplyDefaultPreset: integer("auto_apply_default_preset", {
		mode: "boolean",
	}),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
	notificationSoundsMuted: integer("notification_sounds_muted", {
		mode: "boolean",
	}),
	notificationVolume: integer("notification_volume"),
	deleteLocalBranch: integer("delete_local_branch", { mode: "boolean" }),
	fileOpenMode: text("file_open_mode").$type<FileOpenMode>(),
	showPresetsBar: integer("show_presets_bar", { mode: "boolean" }),
	useCompactTerminalAddButton: integer("use_compact_terminal_add_button", {
		mode: "boolean",
	}),
	terminalFontFamily: text("terminal_font_family"),
	terminalFontSize: integer("terminal_font_size"),
	editorFontFamily: text("editor_font_family"),
	editorFontSize: integer("editor_font_size"),
	showResourceMonitor: integer("show_resource_monitor", { mode: "boolean" }),
	worktreeBaseDir: text("worktree_base_dir"),
	openLinksInApp: integer("open_links_in_app", { mode: "boolean" }),
	defaultEditor: text("default_editor").$type<ExternalApp>(),
	exposeHostServiceViaRelay: integer("expose_host_service_via_relay", {
		mode: "boolean",
	}),
});

export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

export type V1MigrationKind = "project" | "workspace" | "preset";
export type V1MigrationStatus = "success" | "linked" | "error" | "skipped";

export const v1MigrationState = sqliteTable(
	"v1_migration_state",
	{
		v1Id: text("v1_id").notNull(),
		kind: text("kind").notNull().$type<V1MigrationKind>(),
		v2Id: text("v2_id"),
		organizationId: text("organization_id").notNull(),
		status: text("status").notNull().$type<V1MigrationStatus>(),
		reason: text("reason"),
		migratedAt: integer("migrated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		primaryKey({
			columns: [table.organizationId, table.v1Id, table.kind],
		}),
		index("v1_migration_state_v2_id_idx").on(table.v2Id),
	],
);

export type InsertV1MigrationState = typeof v1MigrationState.$inferInsert;
export type SelectV1MigrationState = typeof v1MigrationState.$inferSelect;

// =============================================================================
// Synced tables - mirrored from cloud Postgres via Electric SQL
// Column names match Postgres exactly (snake_case) so Electric data writes directly
// =============================================================================

export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type IntegrationProvider = "linear";

/**
 * Users table - synced from cloud
 */
export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerk_id: text("clerk_id").notNull().unique(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		avatar_url: text("avatar_url"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("users_email_idx").on(table.email),
		index("users_clerk_id_idx").on(table.clerk_id),
	],
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

/**
 * Organizations table - synced from cloud
 */
export const organizations = sqliteTable(
	"organizations",
	{
		id: text("id").primaryKey(),
		clerk_org_id: text("clerk_org_id").unique(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		github_org: text("github_org"),
		avatar_url: text("avatar_url"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("organizations_slug_idx").on(table.slug),
		index("organizations_clerk_org_id_idx").on(table.clerk_org_id),
	],
);

export type InsertOrganization = typeof organizations.$inferInsert;
export type SelectOrganization = typeof organizations.$inferSelect;

/**
 * Organization members table - synced from cloud
 */
export const organizationMembers = sqliteTable(
	"organization_members",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		user_id: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("organization_members_organization_id_idx").on(table.organization_id),
		index("organization_members_user_id_idx").on(table.user_id),
	],
);

export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type SelectOrganizationMember = typeof organizationMembers.$inferSelect;

/**
 * Tasks table - synced from cloud
 */
export const tasks = sqliteTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull().unique(),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status").notNull(),
		status_color: text("status_color"),
		status_type: text("status_type"),
		status_position: integer("status_position"),
		priority: text("priority").notNull().$type<TaskPriority>(),
		organization_id: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repository_id: text("repository_id"),
		assignee_id: text("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		creator_id: text("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		estimate: integer("estimate"),
		due_date: text("due_date"),
		labels: text("labels", { mode: "json" }).$type<string[]>(),
		branch: text("branch"),
		pr_url: text("pr_url"),
		external_provider: text("external_provider").$type<IntegrationProvider>(),
		external_id: text("external_id"),
		external_key: text("external_key"),
		external_url: text("external_url"),
		last_synced_at: text("last_synced_at"),
		sync_error: text("sync_error"),
		started_at: text("started_at"),
		completed_at: text("completed_at"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("tasks_slug_idx").on(table.slug),
		index("tasks_organization_id_idx").on(table.organization_id),
		index("tasks_assignee_id_idx").on(table.assignee_id),
		index("tasks_status_idx").on(table.status),
		index("tasks_created_at_idx").on(table.created_at),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;

/**
 * Execution Circuit tables - local state-transition contracts attached to tasks
 */
export const executionCircuits = sqliteTable(
	"execution_circuits",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		status: text("status").notNull().$type<ExecutionCircuitStatus>(),
		specJson: text("spec_json", { mode: "json" })
			.$type<ExecutionCircuitSpec>()
			.notNull(),
		validationJson: text("validation_json", { mode: "json" })
			.$type<CircuitValidationResult>()
			.notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		uniqueIndex("execution_circuits_task_id_unique_idx").on(table.taskId),
		index("execution_circuits_status_idx").on(table.status),
	],
);

export type InsertExecutionCircuit = typeof executionCircuits.$inferInsert;
export type SelectExecutionCircuit = typeof executionCircuits.$inferSelect;

export const transitionRuns = sqliteTable(
	"transition_runs",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		circuitId: text("circuit_id")
			.notNull()
			.references(() => executionCircuits.id, { onDelete: "cascade" }),
		transitionId: text("transition_id").notNull(),
		status: text("status").notNull().$type<TransitionRunStatus>(),
		workspaceId: text("workspace_id").references(() => workspaces.id, {
			onDelete: "set null",
		}),
		agentRunId: text("agent_run_id"),
		runtimeSnapshotJson: text("runtime_snapshot_json", { mode: "json" })
			.$type<RuntimeBindingSpec>()
			.notNull(),
		monadSnapshotJson: text("monad_snapshot_json", { mode: "json" })
			.$type<ExecutionMonadSpec>()
			.notNull(),
		outputJson: text("output_json", {
			mode: "json",
		}).$type<TransitionRunOutput>(),
		validationResultJson: text("validation_result_json", {
			mode: "json",
		}).$type<TransitionValidationResult>(),
		startedAt: integer("started_at"),
		completedAt: integer("completed_at"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("transition_runs_circuit_id_idx").on(table.circuitId),
		index("transition_runs_transition_id_idx").on(table.transitionId),
		index("transition_runs_status_idx").on(table.status),
	],
);

export type InsertTransitionRun = typeof transitionRuns.$inferInsert;
export type SelectTransitionRun = typeof transitionRuns.$inferSelect;

export const experienceTraceEvents = sqliteTable(
	"experience_trace_events",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		transitionRunId: text("transition_run_id")
			.notNull()
			.references(() => transitionRuns.id, { onDelete: "cascade" }),
		sequence: integer("sequence").notNull(),
		type: text("type").notNull(),
		message: text("message").notNull(),
		payloadJson: text("payload_json", {
			mode: "json",
		}).$type<TraceEventPayload>(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("experience_trace_events_transition_run_id_idx").on(
			table.transitionRunId,
		),
		uniqueIndex("experience_trace_events_run_sequence_unique_idx").on(
			table.transitionRunId,
			table.sequence,
		),
		index("experience_trace_events_sequence_idx").on(table.sequence),
	],
);

export type InsertExperienceTraceEvent =
	typeof experienceTraceEvents.$inferInsert;
export type SelectExperienceTraceEvent =
	typeof experienceTraceEvents.$inferSelect;

/**
 * Browser history table - persists browsing history for URL autocomplete
 */
export const browserHistory = sqliteTable(
	"browser_history",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		url: text("url").notNull().unique(),
		title: text("title").notNull().default(""),
		faviconUrl: text("favicon_url"),
		lastVisitedAt: integer("last_visited_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		visitCount: integer("visit_count").notNull().default(1),
	},
	(table) => [
		index("browser_history_url_idx").on(table.url),
		index("browser_history_last_visited_at_idx").on(table.lastVisitedAt),
	],
);

export type InsertBrowserHistory = typeof browserHistory.$inferInsert;
export type SelectBrowserHistory = typeof browserHistory.$inferSelect;

// ===========================================================================
// Automation Fabric — Electric-synced read models
//
// Local SQLite mirrors of the server workflow/skill/run tables. Columns use
// snake_case to match the synced shape; timestamps are ISO strings (text) and
// jsonb columns are `text({ mode: "json" })`. Enum columns are plain text.
//
// Sync shapes (electric-proxy) are wired up alongside the desktop Automations
// UI; these tables only carry data once their shapes are subscribed. Per
// AGENTS.md, render persisted rows cache-first and never blank them on
// `!isReady`.
// ===========================================================================

/** Mirror of server `workflow_definitions`. */
export const workflowDefinitions = sqliteTable(
	"workflow_definitions",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		v2_project_id: text("v2_project_id"),
		owner_user_id: text("owner_user_id").notNull(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		engine: text("engine").notNull(),
		draft_state: text("draft_state", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		status: text("status").notNull(),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("workflow_definitions_org_idx").on(table.organization_id),
		index("workflow_definitions_project_idx").on(table.v2_project_id),
	],
);

export type InsertWorkflowDefinition = typeof workflowDefinitions.$inferInsert;
export type SelectWorkflowDefinition = typeof workflowDefinitions.$inferSelect;

/** Mirror of server `skills`. */
export const skills = sqliteTable(
	"skills",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		v2_project_id: text("v2_project_id"),
		owner_user_id: text("owner_user_id").notNull(),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		kind: text("kind").notNull(),
		status: text("status").notNull(),
		visibility: text("visibility").notNull(),
		current_version_id: text("current_version_id"),
		icon: text("icon"),
		category: text("category"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("skills_org_idx").on(table.organization_id),
		index("skills_kind_idx").on(table.kind),
	],
);

export type InsertSkill = typeof skills.$inferInsert;
export type SelectSkill = typeof skills.$inferSelect;

/** Mirror of server `skill_versions`. */
export const skillVersions = sqliteTable(
	"skill_versions",
	{
		id: text("id").primaryKey(),
		skill_id: text("skill_id").notNull(),
		organization_id: text("organization_id").notNull(),
		version_number: integer("version_number").notNull(),
		input_schema: text("input_schema", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		output_schema: text("output_schema", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		workflow_deployment_id: text("workflow_deployment_id"),
		legacy_automation_id: text("legacy_automation_id"),
		sim_workflow_external_id: text("sim_workflow_external_id"),
		run_modes: text("run_modes", { mode: "json" }).$type<string[]>(),
		documentation_md: text("documentation_md"),
		created_at: text("created_at").notNull(),
	},
	(table) => [index("skill_versions_skill_idx").on(table.skill_id)],
);

export type InsertSkillVersion = typeof skillVersions.$inferInsert;
export type SelectSkillVersion = typeof skillVersions.$inferSelect;

/** Mirror of server `skill_bindings`. */
export const skillBindings = sqliteTable(
	"skill_bindings",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		skill_id: text("skill_id").notNull(),
		surface: text("surface").notNull(),
		object_type: text("object_type"),
		placement: text("placement"),
		label: text("label"),
		enabled: integer("enabled", { mode: "boolean" }).notNull(),
		config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("skill_bindings_skill_idx").on(table.skill_id),
		index("skill_bindings_surface_idx").on(table.surface, table.object_type),
	],
);

export type InsertSkillBinding = typeof skillBindings.$inferInsert;
export type SelectSkillBinding = typeof skillBindings.$inferSelect;

/** Mirror of server `workflow_runs`. */
export const workflowRuns = sqliteTable(
	"workflow_runs",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		v2_project_id: text("v2_project_id"),
		workflow_id: text("workflow_id"),
		workflow_version_id: text("workflow_version_id"),
		skill_id: text("skill_id"),
		skill_version_id: text("skill_version_id"),
		parent_run_id: text("parent_run_id"),
		trigger_kind: text("trigger_kind").notNull(),
		trigger_ref: text("trigger_ref", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		status: text("status").notNull(),
		input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
		output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
		error: text("error", { mode: "json" }).$type<Record<string, unknown>>(),
		context_pack_id: text("context_pack_id"),
		cost: text("cost", { mode: "json" }).$type<Record<string, unknown>>(),
		started_at: text("started_at"),
		ended_at: text("ended_at"),
		created_by_user_id: text("created_by_user_id"),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("workflow_runs_org_idx").on(table.organization_id),
		index("workflow_runs_workflow_idx").on(table.workflow_id),
		index("workflow_runs_skill_idx").on(table.skill_id),
		index("workflow_runs_parent_idx").on(table.parent_run_id),
		index("workflow_runs_status_idx").on(table.status),
	],
);

export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;
export type SelectWorkflowRun = typeof workflowRuns.$inferSelect;

/** Mirror of server `workflow_run_steps`. */
export const workflowRunSteps = sqliteTable(
	"workflow_run_steps",
	{
		id: text("id").primaryKey(),
		run_id: text("run_id").notNull(),
		parent_step_id: text("parent_step_id"),
		block_id: text("block_id").notNull(),
		block_type: text("block_type").notNull(),
		block_name: text("block_name"),
		status: text("status").notNull(),
		input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
		output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
		error: text("error", { mode: "json" }).$type<Record<string, unknown>>(),
		started_at: text("started_at"),
		ended_at: text("ended_at"),
		duration_ms: integer("duration_ms"),
		cost: text("cost", { mode: "json" }).$type<Record<string, unknown>>(),
	},
	(table) => [
		index("workflow_run_steps_run_idx").on(table.run_id),
		index("workflow_run_steps_parent_idx").on(table.parent_step_id),
	],
);

export type InsertWorkflowRunStep = typeof workflowRunSteps.$inferInsert;
export type SelectWorkflowRunStep = typeof workflowRunSteps.$inferSelect;

/** Mirror of server `artifacts`. */
export const artifacts = sqliteTable(
	"artifacts",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		v2_project_id: text("v2_project_id"),
		run_id: text("run_id"),
		kind: text("kind").notNull(),
		title: text("title"),
		body: text("body", { mode: "json" }).$type<Record<string, unknown>>(),
		markdown: text("markdown"),
		blob_pathname: text("blob_pathname"),
		media_type: text("media_type"),
		created_by_user_id: text("created_by_user_id"),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("artifacts_org_idx").on(table.organization_id),
		index("artifacts_run_idx").on(table.run_id),
	],
);

export type InsertArtifact = typeof artifacts.$inferInsert;
export type SelectArtifact = typeof artifacts.$inferSelect;

/** Mirror of server `approval_requests`. */
export const approvalRequests = sqliteTable(
	"approval_requests",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		run_id: text("run_id"),
		step_id: text("step_id"),
		status: text("status").notNull(),
		title: text("title"),
		payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
		reason: text("reason"),
		requested_by_user_id: text("requested_by_user_id"),
		resolved_by_user_id: text("resolved_by_user_id"),
		resolved_at: text("resolved_at"),
		expires_at: text("expires_at"),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("approval_requests_org_idx").on(table.organization_id),
		index("approval_requests_run_idx").on(table.run_id),
		index("approval_requests_status_idx").on(table.status),
	],
);

export type InsertApprovalRequest = typeof approvalRequests.$inferInsert;
export type SelectApprovalRequest = typeof approvalRequests.$inferSelect;

/** Mirror of server `object_relations`. */
export const objectRelations = sqliteTable(
	"object_relations",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		source_type: text("source_type").notNull(),
		source_id: text("source_id").notNull(),
		relation_type: text("relation_type").notNull(),
		target_type: text("target_type").notNull(),
		target_id: text("target_id").notNull(),
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("object_relations_source_idx").on(table.source_type, table.source_id),
		index("object_relations_target_idx").on(table.target_type, table.target_id),
	],
);

export type InsertObjectRelation = typeof objectRelations.$inferInsert;
export type SelectObjectRelation = typeof objectRelations.$inferSelect;
