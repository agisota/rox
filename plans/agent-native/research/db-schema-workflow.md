# DB Schema Conventions + Skills/Workflow Tables (`packages/db`)

Research for the **agent-native** port (AgentSource registry table + chat-session status/labels).
All paths are relative to `packages/db/` unless noted. Repo root for this research: `/home/dev/1/rox-agent-native` (branch `feat/agent-native`); content is identical to `/home/dev/1/rox`.

> **CRITICAL RULE (repeated in 3 file headers):** never hand-edit migrations or files under `drizzle/`. Change the schema TS in `src/schema/` then run `bunx drizzle-kit generate --name="..."`. See `src/schema/workflow.ts:17-18`, `src/schema/knowledge.ts:13-14`, and root `AGENTS.md`.

---

## 1. Schema directory map

Drizzle config: `drizzle.config.ts:5-11` — `schema: "./src/schema/index.ts"`, `out: "./drizzle"`, `dialect: "postgresql"`, `dbCredentials.url = env.DATABASE_URL_UNPOOLED`, **`casing: "snake_case"`** (column TS names are camelCase, physically emitted snake_case).

The barrel `src/schema/index.ts:1-14` re-exports every file below (`export * from "./..."`). Every file is one Drizzle schema module; one file (`relations.ts`) holds only `relations()` wiring; one (`enums.ts`) holds the canonical Zod/value-array enum source; one (`zod.ts`) holds hand-written Zod schemas; one (`types.ts`) holds plain TS types for jsonb payloads.

| File | Purpose |
|---|---|
| `src/schema/index.ts` | Barrel — `export *` from all 14 sibling modules (`index.ts:1-14`). |
| `src/schema/enums.ts` | **Single source of truth for all enums.** `as const` string-tuple values + Zod enums + inferred TS types. Consumed by every `pgEnum(...)` declaration elsewhere (`enums.ts:1-398`). |
| `src/schema/auth.ts` | Better-Auth tables: `users`, `organizations`, `members`, `invitations`, `sessions`, `accounts`, verification, MCP/OAuth. All ids `uuid("id").primaryKey().defaultRandom()` (`auth.ts:19,43,64,…`). |
| `src/schema/schema.ts` | Core product tables: `tasks`, `task_statuses`, **`integration_connections`**, `integration_inbound_events`, `subscriptions`, `device_presence`, `agent_commands`, `users__slack_users`, `projects`, `v2_projects`, `v2_hosts`, `v2_clients`, `v2_users_hosts`, `v2_workspaces`, `workspaces`, `secrets`, `sandbox_images`, **`chat_sessions`**, `chat_attachments`, `automations`, `automation_runs`, `automation_prompt_versions`, `access_grants`, `submitted_prompts` (`schema.ts:1-1024`). |
| `src/schema/workflow.ts` | **Automation Fabric**: workflow/skill/run graph layer — `workflow_definitions`, `workflow_versions`, `workflow_deployments`, `skills`, `skill_versions`, `skill_bindings`, `context_packs`, `workflow_runs`, `workflow_run_steps`, `artifacts`, `object_relations`, `approval_requests`, `evaluation_*` (`workflow.ts:1-800`). |
| `src/schema/circuit.ts` | Execution Circuit epic: `execution_circuits`, `transition_runs`, `experience_trace_events` (referenced from `relations.ts:12-16,665-709`). |
| `src/schema/economy.ts` | Billing/economy: `rox_balances`, `rox_ledger`, `rox_topups`, `usage_requests` (`relations.ts:17`). |
| `src/schema/github.ts` | `github_installations`, `github_repositories`, `github_pull_requests` (`github.ts:1-50+`). |
| `src/schema/knowledge.ts` | Notebook/fumadocs: `knowledge_documents`, `knowledge_links` + typed `KnowledgeSourceRef` jsonb (`knowledge.ts:1-60`). |
| `src/schema/profiles.ts` | Vibe-usage profiles (migration `0067_vibe_usage_profiles.sql`). |
| `src/schema/attribution.ts` | Marketing attribution: `user_attribution`, `payment_attributions` (`relations.ts:3,750-775`). |
| `src/schema/ingest.ts` | Small ingest helper table (1.2 KB). |
| `src/schema/relations.ts` | **All `relations()` wiring** for Drizzle relational queries. No tables defined here (`relations.ts:1-827`). |
| `src/schema/types.ts` | Plain TS discriminated-union types for jsonb payloads, e.g. `IntegrationConfig` per provider (`types.ts:1-61`). |
| `src/schema/zod.ts` | Hand-written Zod schemas for workspace config + economy views (`zod.ts:1-69`). **No `drizzle-zod`** (confirmed: `grep drizzle-zod` → 0 hits). |

Non-schema support files: `src/client.ts`, `src/env.ts`, `src/local-proxy.ts`, `src/seed-default-statuses.ts`, `src/seed-demo-project.ts`, `src/utils/`.

---

## 2. Conventions (with file:line)

### Primary keys / IDs — UUID **v4**, NOT v7
Every table uses Drizzle's `uuid` column type with `.primaryKey().defaultRandom()`:
```ts
id: uuid().primaryKey().defaultRandom(),
```
- `workflow.ts:112,161,203,243,303,374,410,444,517,559,603,643,696,721,745,781`
- `schema.ts:74,112,192,…` ; `auth.ts:19,43,64,…`

`.defaultRandom()` emits Postgres **`gen_random_uuid()`** = UUID **v4** (random), confirmed by `grep -rn "v7|gen_random|\$default(" src/schema/` → **0 hits**. There is **no UUID v7 utility** in this package. (This contradicts the global "UUID v7" engineering rule — the repo standard here is v4 `defaultRandom()`. A new table should match the repo, i.e. `uuid().primaryKey().defaultRandom()`, unless the team explicitly decides to introduce v7.)

Foreign-key id columns are explicitly named snake_case in TS: `uuid("organization_id")`, `uuid("v2_project_id")`, `uuid("owner_user_id")` (`workflow.ts:113,116,119`).

### Timestamps
Two co-existing styles (newer modules use `withTimezone`):
- **New / workflow style — `timestamptz`:**
  ```ts
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  ```
  `workflow.ts:131-137,269-275`; same pattern in `automations` (`schema.ts:894-900`), `v2_*` tables (`schema.ts:521-527`), `device_presence` (`schema.ts:339-344`).
- **Older core style — bare `timestamp` (no tz):** `tasks`, `task_statuses`, `integration_connections`, `chat_sessions`, `projects`, `workspaces` use `timestamp("created_at").notNull().defaultNow()` (`schema.ts:89-93,161-165,220-224,802-807`).

`updatedAt` always pairs `.notNull().defaultNow().$onUpdate(() => new Date())`. Event/append-only tables omit `updatedAt` (e.g. `workflow_versions` has only `createdAt` — `workflow.ts:179-181`; `workflow_run_steps` has no created/updated, only `startedAt`/`endedAt` — `workflow.ts:533-535`).

### Soft-delete (`deleted_at`)
**Not a universal convention.** Present only where the domain needs it:
- `tasks.deletedAt = timestamp("deleted_at")` (`schema.ts:158`).
- `users` (migration `0002_add_deleted_at_users.sql`).
- `integration_connections` uses `disconnectedAt` + `disconnectReason` instead of `deletedAt` (`schema.ts:212-213`).
**The entire `workflow.ts` / skills layer has NO soft-delete** — it uses lifecycle status enums (`draft|published|deprecated|archived` for skills/workflows; `active|inactive|failed` for deployments) instead (`enums.ts:144-163,175-182`).

### Enums — defined in `enums.ts`, wrapped by `pgEnum` at use site
The pattern is consistent and **append-only** (headers warn "never reorder/remove" — `enums.ts:56,329,379`):
1. `enums.ts` declares `export const xxxValues = [...] as const;` then `export const xxxEnum = z.enum(xxxValues);` then `export type Xxx = z.infer<typeof xxxEnum>;` (e.g. `enums.ts:144-151`).
2. The schema module imports the `*Values` tuple and builds the pg enum: `export const workflowStatus = pgEnum("workflow_status", workflowStatusValues);` (`workflow.ts:67-94`).
   - One exception: `evaluationStatus` pgEnum is declared inside `workflow.ts:688-691` (still sourced from `evaluationStatusValues` in `enums.ts:291-299`).
3. Column usage: `status: workflowStatus().notNull().default("draft")` (`workflow.ts:129`).

### JSONB usage
Heavy and always `.$type<...>()`-annotated. Domain types come from `@rox/workflow-core` (`RoxWorkflowState`, `JsonSchema`, `ObjectRef`, `RunCost`, `WorkflowRunError`, `WorkflowValidationResult` — `workflow.ts:21-28`), from local `types.ts` (`IntegrationConfig`), or inline loose types (`Record<string, unknown>`, or local placeholder aliases `SkillExample`/`SkillPolicy` etc. at `workflow.ts:98-103`). jsonb arrays/objects that must never be null use `.notNull().default([])` or `.default({})` (`workflow.ts:330-343`).

### Naming
- Tables: snake_case plural (`workflow_definitions`, `skill_versions`, `chat_sessions`).
- Columns: camelCase in TS, snake_case in DB via `casing: "snake_case"` (config) **or** explicit string arg `uuid("organization_id")`.
- Indexes: prefixed with table name + `_idx` / `_uniq` (`workflow.ts:140,145`). Partial unique indexes via `.where(sql\`...\`)` (`workflow.ts:227-229`, `schema.ts:233-243`).
- Exported types per table: `export type InsertX = typeof x.$inferInsert;` and `export type SelectX = typeof x.$inferSelect;` immediately after each table (`workflow.ts:151-152,289-290`).

### Multi-tenancy (org scoping) — near-universal
Almost every business table carries `organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" })` plus an org index, so Electric SQL can shape-filter by org (`workflow.ts:113-115,145`; comment `schema.ts:464-465`). FK delete behaviors are deliberate: `cascade` for owning org/project, `set null` for optional/audit refs (`createdByUserId` → `set null`, `workflow.ts:176-178,345-347`), `restrict` for immutable references (`workflow_version_id`, `workflow_deployment_id` — `workflow.ts:209,318`).

---

## 3. `workflow.ts` tables — full definitions

File header (`workflow.ts:1-19`) describes the canonical entity chain:
`workflow_definitions → workflow_versions (immutable) → workflow_deployments`; `skills → skill_versions`; `skill_bindings`; `workflow_runs → workflow_run_steps`; `context_packs`, `artifacts`, `object_relations`, `approval_requests`, `evaluation_*`.

pgEnums declared (`workflow.ts:67-94` + `688-691`): `workflow_engine`, `workflow_status`, `workflow_deployment_status`, `skill_kind`, `skill_status`, `skill_visibility`, `skill_binding_surface`, `workflow_run_status`, `workflow_step_status`, `trigger_kind`, `object_type`, `approval_status`, `artifact_kind`, `evaluation_status`.

### `workflow_definitions` (`workflow.ts:109-149`) — draft identity of a workflow
```ts
id: uuid().primaryKey().defaultRandom(),
organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, { onDelete: "cascade" }),
ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
name: text().notNull(),
slug: text().notNull(),
description: text(),
engine: workflowEngine().notNull().default("rox"),
draftState: jsonb("draft_state").$type<RoxWorkflowState>().notNull(),
status: workflowStatus().notNull().default("draft"),
createdAt / updatedAt: timestamptz, notNull, defaultNow (+ $onUpdate)
// indexes: uniqueIndex(org,v2_project,slug); idx(org), idx(v2_project), idx(owner)
```

### `workflow_versions` (`workflow.ts:158-191`) — immutable graph snapshot
```ts
id; workflowId → workflow_definitions (cascade); organizationId → orgs (cascade);
versionNumber: integer("version_number").notNull();
stateSnapshot: jsonb("state_snapshot").$type<RoxWorkflowState>().notNull();
validationSnapshot: jsonb("validation_snapshot").$type<WorkflowValidationResult>();  // nullable
changelog: text();
createdByUserId: uuid → users (set null);
createdAt: timestamptz notNull defaultNow;  // append-only, no updatedAt
// uniqueIndex(workflowId, versionNumber); idx(workflow), idx(org)
```

### `workflow_deployments` (`workflow.ts:200-231`) — runnable version per env
```ts
id; workflowId → defs (cascade); workflowVersionId → versions (restrict); organizationId → orgs (cascade);
environment: text().notNull().default("production");
status: workflowDeploymentStatus().notNull().default("active");
deployedByUserId → users (set null);
deployedAt: timestamptz notNull defaultNow;
// idx(workflow), idx(org);
// uniqueIndex(workflowId, environment).where(status = 'active')  -- one active deploy per env
```

### `skills` (`workflow.ts:240-287`) — product-level reusable capability
```ts
id; organizationId → orgs (cascade); v2ProjectId → v2Projects (cascade, nullable); ownerUserId → users (cascade);
slug: text().notNull(); name: text().notNull(); description: text();
kind: skillKind().notNull();                       // instruction|workflow|tool|agent|template
status: skillStatus().notNull().default("draft");  // draft|published|deprecated|archived
visibility: skillVisibility().notNull().default("private"); // private|project|organization|public
currentVersionId: uuid("current_version_id"),  // SOFT pointer — intentionally NOT a DB FK (circular). Integrity at service layer (workflow.ts:261-264)
icon: text(); category: text();
createdAt/updatedAt: timestamptz;
// uniqueIndex(org, v2_project, slug); idx(org), idx(v2_project), idx(kind)
```

### `skill_versions` (`workflow.ts:300-362`) — typed immutable executable contract
Exactly one implementation ref expected (enforced service-side, see "DB-06" comment `workflow.ts:294-298`).
```ts
id; skillId → skills (cascade); organizationId → orgs (cascade);
versionNumber: integer("version_number").notNull();
inputSchema:  jsonb("input_schema").$type<JsonSchema>().notNull();
outputSchema: jsonb("output_schema").$type<JsonSchema>().notNull();
// mutually-exclusive impl refs:
workflowDeploymentId: uuid → workflow_deployments (restrict);
legacyAutomationId:   uuid → automations (set null);   // wraps legacy scheduled automation
simWorkflowExternalId: text("sim_workflow_external_id");
externalToolRef: jsonb("external_tool_ref").$type<Record<string,unknown>>();
documentationMd: text("documentation_md");
examples: jsonb().$type<SkillExample[]>();
runModes:            jsonb("run_modes").$type<SkillRunMode[]>().notNull().default([]);
requiredContext:     jsonb("required_context").$type<ContextRequirement[]>().notNull().default([]);
requiredConnections: jsonb("required_connections").$type<ConnectionRequirement[]>().notNull().default([]);
requiredSecrets:     jsonb("required_secrets").$type<SecretRequirement[]>().notNull().default([]);
policy:              jsonb().$type<SkillPolicy>().notNull().default({});
createdByUserId → users (set null); createdAt: timestamptz;
// uniqueIndex(skillId, versionNumber); idx(skill), idx(org), idx(deployment), idx(legacy_automation)
```

### `skill_bindings` (`workflow.ts:371-401`) — controlled exposure surfaces
```ts
id; organizationId → orgs (cascade); skillId → skills (cascade);
surface: skillBindingSurface().notNull();   // object_action|command_palette|workflow_node|agent_tool|api|mcp
objectType: objectType("object_type");      // nullable; which object_type the action attaches to
placement: text(); label: text();
enabled: boolean().notNull().default(true);
config: jsonb().$type<Record<string,unknown>>();
createdAt: timestamptz;
// idx(skill); idx(surface, objectType, enabled); idx(org)
```

### `context_packs` (`workflow.ts:407-435`) — reproducibility snapshot
```ts
id; organizationId → orgs (cascade); v2ProjectId → v2Projects (set null);
includedObjectRefs: jsonb("included_object_refs").$type<ObjectRef[]>().notNull().default([]);
retrievalConfig / redactionPolicy / snapshot: jsonb $type<Record<string,unknown>>();
tokenBudget: integer("token_budget");
createdAt: timestamptz; // idx(org)
```

### `workflow_runs` (`workflow.ts:441-505`) — canonical execution record (NOT `automation_runs`)
```ts
id; organizationId → orgs (cascade); v2ProjectId → v2Projects (set null);
workflowId → defs (set null); workflowVersionId → versions (set null);
skillId → skills (set null); skillVersionId → skill_versions (set null);
parentRunId: uuid("parent_run_id");  // self-FK in table extras → workflow_runs.id (cascade)
triggerKind: triggerKind("trigger_kind").notNull();  // manual|command|chat|schedule|webhook|api|mcp|repo_connected|...
triggerRef: jsonb("trigger_ref").$type<Record<string,unknown>>();
status: workflowRunStatus().notNull().default("queued"); // queued|running|waiting_approval|succeeded|failed|canceled|timeout
input:  jsonb().$type<Record<string,unknown>>().notNull().default({});
output: jsonb().$type<Record<string,unknown>>();
error:  jsonb().$type<WorkflowRunError>();
contextPackId → context_packs (set null);
cost: jsonb().$type<RunCost>();
startedAt / endedAt: timestamptz (nullable);
createdByUserId → users (set null); createdAt: timestamptz;
// idx(org), idx(project), idx(workflow), idx(skill), idx(status), idx(parent);
// foreignKey(parentRunId → id) cascade   (workflow.ts:499-503)
```

### `workflow_run_steps` (`workflow.ts:514-547`) — block-level trace
```ts
id; runId → workflow_runs (cascade); parentStepId (self-FK → id, cascade);
blockId / blockType: text().notNull(); blockName: text();
status: workflowStepStatus().notNull().default("pending"); // pending|running|succeeded|failed|skipped|waiting_approval|canceled
input/output: jsonb; error: jsonb $type<WorkflowRunError>();
startedAt/endedAt: timestamptz; durationMs: integer("duration_ms"); cost: jsonb $type<RunCost>();
// idx(run), idx(parent); foreignKey(parentStepId → id) cascade
```

### `artifacts` (`workflow.ts:556-589`) — structured run outputs
```ts
id; organizationId → orgs (cascade); v2ProjectId → v2Projects (set null); runId → workflow_runs (set null);
kind: artifactKind().notNull(); // markdown_doc|json|table|file|repo_report|task_plan|pr_plan|meeting_summary
title: text(); body: jsonb $type<Record<string,unknown>>(); markdown: text();
blobPathname: text("blob_pathname"); mediaType: text("media_type");
createdByUserId → users (set null); createdAt: timestamptz;
// idx(org), idx(project), idx(run)
```

### `object_relations` (`workflow.ts:600-631`) — typed edges of the Rox object graph
Object ids are **`text`** because they reference many tables.
```ts
id; organizationId → orgs (cascade);
sourceType: objectType("source_type").notNull(); sourceId: text("source_id").notNull();
relationType: text("relation_type").notNull();
targetType: objectType("target_type").notNull(); targetId: text("target_id").notNull();
metadata: jsonb $type<Record<string,unknown>>(); createdAt: timestamptz;
// idx(source), idx(target), idx(org); uniqueIndex(sourceType, sourceId, relationType, targetType, targetId)
```

### `approval_requests` (`workflow.ts:640-679`) — human-in-the-loop gate
```ts
id; organizationId → orgs (cascade); runId → workflow_runs (cascade); stepId → workflow_run_steps (cascade);
status: approvalStatus().notNull().default("pending"); // pending|approved|rejected|expired|canceled
blockId: text("block_id"); title: text(); payload: jsonb; reason: text();
requestedByUserId / resolvedByUserId → users (set null);
resolvedAt / expiresAt: timestamptz; createdAt: timestamptz;
// idx(org), idx(run), idx(status)
```

### Evaluations (M9) (`workflow.ts:688-799`)
- `evaluation_suites` (`693-713`): id; org (cascade); skillId → skills (cascade); name notNull; description; createdByUserId (set null); createdAt. idx(skill).
- `evaluation_cases` (`718-737`): id; suiteId → suites (cascade); org (cascade); name; `input` jsonb notNull default {}; `expectedOutput` jsonb; `outputSchema` jsonb $type<JsonSchema>; createdAt. idx(suite).
- `evaluation_runs` (`742-773`): id; org; suiteId → suites (cascade); skillVersionId → skill_versions (set null); status: evaluationStatus default "pending"; `passRate` real; `totalCases`/`passedCases` integer; startedAt/endedAt; createdByUserId; createdAt. idx(suite), idx(version).
- `evaluation_results` (`778-799`): id; runId → evaluation_runs (cascade); caseId → evaluation_cases (cascade); status: evaluationStatus notNull; `actualOutput` jsonb; `failures` jsonb $type<{path,message}[]>; createdAt. idx(run).

---

## 4. skills / chat_sessions / tasks tables — verbatim columns + enums

### `chat_sessions` (`schema.ts:785-817`)
```ts
export const chatSessions = pgTable("chat_sessions", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  v2WorkspaceId: uuid("v2_workspace_id").references(() => v2Workspaces.id, { onDelete: "set null" }),
  title: text(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("chat_sessions_org_idx").on(table.organizationId),
  index("chat_sessions_created_by_idx").on(table.createdBy),
  index("chat_sessions_last_active_idx").on(table.lastActiveAt),
]);
```
**No status, no labels today** — `title` is the only mutable descriptive field. Note timestamps here are bare `timestamp` (no `withTimezone`). The agent-native port's "status/labels on chat sessions" would add a new pgEnum (`chat_session_status`) + a `labels: jsonb().$type<string[]>().default([])` column (mirror `tasks.labels` at `schema.ts:137`).

### `tasks` (`schema.ts:109-186`) — the closest analog for "status + labels"
```ts
export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull(),
  title: text().notNull(),
  description: text(),
  statusId: uuid("status_id").notNull().references(() => taskStatuses.id),  // FK to a row, not an enum
  priority: taskPriority().notNull().default("none"),                       // enum
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  estimate: integer(),
  dueDate: timestamp("due_date"),
  labels: jsonb().$type<string[]>().default([]),     // <-- labels pattern: jsonb string array
  branch: text(),
  prUrl: text("pr_url"),
  externalProvider: integrationProvider("external_provider"),  // enum, nullable
  externalId: text("external_id"),
  externalKey: text("external_key"),     // "SUPER-172", "#123"
  externalUrl: text("external_url"),
  lastSyncedAt: timestamp("last_synced_at"),
  syncError: text("sync_error"),
  assigneeExternalId: text("assignee_external_id"),
  assigneeDisplayName: text("assignee_display_name"),
  assigneeAvatarUrl: text("assignee_avatar_url"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  deletedAt: timestamp("deleted_at"),    // <-- soft-delete here
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("tasks_slug_idx"), index("tasks_organization_id_idx"), index("tasks_assignee_id_idx"),
  index("tasks_creator_id_idx"), index("tasks_status_id_idx"), index("tasks_created_at_idx"),
  index("tasks_external_provider_idx"), index("tasks_assignee_external_id_idx"),
  unique("tasks_external_unique").on(organizationId, externalProvider, externalId),
  unique("tasks_org_slug_unique").on(organizationId, slug),
]);
```
**Key design note:** task *status* is **not** a pgEnum on the row — it's an FK `statusId → task_statuses.id` (`schema.ts:118-120`), a per-org configurable status table (`task_statuses`, `schema.ts:71-104`, with `name/color/type/position/progressPercent` + external sync). The enum `taskStatusEnumValues` (`enums.ts:3-12`: `backlog|todo|planning|working|needs-feedback|ready-to-merge|completed|canceled`) is the canonical/seed set used in app logic and seeding (`src/seed-default-statuses.ts`), not a column. `taskPriorityValues` (`enums.ts:16-22`: `urgent|high|medium|low|none`) **is** a column enum.

### `skills` — see §3 above (`workflow.ts:240-287`). Verbatim enum values:
- `skillKindValues` (`enums.ts:165-171`): `["instruction","workflow","tool","agent","template"]`
- `skillStatusValues` (`enums.ts:175-180`): `["draft","published","deprecated","archived"]`
- `skillVisibilityValues` (`enums.ts:184-189`): `["private","project","organization","public"]`
- `skillBindingSurfaceValues` (`enums.ts:193-200`): `["object_action","command_palette","workflow_node","agent_tool","api","mcp"]`

### Other relevant enums (verbatim, `enums.ts`)
- `objectTypeValues` (`249-264`): `["organization","project","workspace","repo","task","issue","pr","chat_session","workflow","skill","run","artifact","approval","policy"]` — **note `chat_session` is already an object type.**
- `triggerKindValues` (`228-245`): `["manual","command","chat","schedule","webhook","api","mcp","repo_connected","branch_created","commit_pushed","pr_opened","task_created","task_status_changed","file_uploaded","approval_resolved","agent_run_finished"]`
- `integrationProviderValues` (`26-36`): `["linear","github","slack","telegram","discord","notion","obsidian","fibery","lark"]`
- `workflowEngineValues` (`135-140`): `["rox","sim_sidecar","legacy_automation","external_tool"]`

---

## 5. `relations.ts` and `zod.ts` patterns

### `relations.ts` (`relations.ts:1-827`)
- Imports every table from the sibling modules (`relations.ts:3-58`), then declares one `export const xxxRelations = relations(table, ({ one, many }) => ({...}))` per table.
- `one(...)` for the parent side: `{ fields: [child.fkCol], references: [parent.id] }` (e.g. `workflowVersions.workflow` at `relations.ts:498-501`).
- `many(...)` for the inverse (e.g. `workflowDefinitions.versions` / `.deployments` at `relations.ts:490-491`).
- **Self-references** use a `relationName` to disambiguate parent/child: `workflowRuns.parentRun`/`childRuns` share `relationName: "runHierarchy"` (`relations.ts:588-593`); `workflowRunSteps` use `"stepHierarchy"` (`relations.ts:606-611`); tasks `assignee`/`creator` use named relations (`relations.ts:173-182`).
- The `skills.currentVersionId` soft pointer is deliberately **not** modeled as a relation — comment at `relations.ts:541-542` says query it directly to avoid an ambiguous second skills↔skill_versions relation.
- New tables must register here: org relation, owner/user relations, and parent/child `many`. A new `agentSource` table would get an `agentSourcesRelations` block (org `one`, owner `one`, plus `many(skillVersions)` if skills point at it) and `organizationsRelations` (`relations.ts:98-122`) would gain `agentSources: many(agentSources)`.

### `zod.ts` (`zod.ts:1-69`) — **hand-written, NOT `drizzle-zod`**
Confirmed: `grep -rn "drizzle-zod|createInsertSchema|createSelectSchema" src/` → 0 hits. Patterns:
- Plain `z.object({...})` schemas for jsonb payloads / RPC inputs (e.g. `localWorkspaceConfigSchema`, `cloudWorkspaceConfigSchema`, union `workspaceConfigSchema` — `zod.ts:8-31`).
- Reuses enum Zod objects from `enums.ts` (imports `sandboxStatusEnum`, `roxLedgerKindEnum`, `roxTopupStatusEnum` at `zod.ts:3-6`).
- View/RPC schemas (`roxLedgerEntrySchema`, `roxTopupViewSchema` — `zod.ts:49-68`) describe API shapes, each paired with `export type X = z.infer<typeof xSchema>;`.
So **schema validation = the `enums.ts` Zod enums + hand-written `zod.ts` object schemas**; Drizzle row types come from `$inferInsert`/`$inferSelect`, not from generated Zod.

---

## 6. Migration authoring flow (exact commands + where files land)

1. **Edit the schema TS only** under `src/schema/` (e.g. add a new `pgTable` in `workflow.ts` or a new module + `export *` line in `index.ts`). Add any new enum value tuples to `enums.ts` first (append-only) and wrap them with `pgEnum(...)` at the use site.
2. **Generate the migration (offline, schema-vs-snapshot diff — does NOT touch any DB):**
   ```bash
   bunx drizzle-kit generate --name="<sample_name_snake_case>"
   ```
   (Documented in `workflow.ts:18`, `knowledge.ts:13-14`, and root `AGENTS.md`.)
3. **Output lands in `packages/db/drizzle/`:**
   - Numbered SQL file: `drizzle/NNNN_<name>.sql` (committed migrations run 0000…0067; **69 `.sql` files total**; latest = `0067_vibe_usage_profiles.sql`). The numeric prefix auto-increments.
   - **Migration journal:** `packages/db/drizzle/meta/_journal.json` (`version: "7"`, `dialect: "postgresql"`, ordered `entries[]` with `idx`/`tag`/`when` — verified head shows `0000_initial_migration` … ).
   - Per-migration snapshot: `drizzle/meta/NNNN_snapshot.json`.
   - **Never hand-edit any of these** (root `AGENTS.md` "DB migrations" + the three file-header warnings).
4. **package.json scripts** (`packages/db/package.json:40-46`) — note **`generate` is intentionally NOT a script** (you invoke `bunx drizzle-kit generate` directly):
   - `"push": "drizzle-kit push"` — **deploy-only; do NOT run against production without explicit confirmation.**
   - `"migrate": "drizzle-kit migrate"` — **deploy-only; same restriction.**
   - `"studio": "drizzle-kit studio"`, `"typecheck": "tsc --noEmit ..."`.
   Drizzle versions: `drizzle-orm 0.45.2`, `drizzle-kit 0.31.8`, `zod 4.3.6` (`package.json:53-61`).
5. Local testing of an applied migration → spin up a fresh Neon branch and point root `.env` at it; never point at production (root `AGENTS.md`).

---

## 7. Where an `agentSource` / source-registry table fits + proposed sketch

### Existing "source / integration / connection" landscape (so we don't collide)
- **`integration_connections`** (`schema.ts:189-252`): org-scoped (optionally workspace-scoped) OAuth/token store for external **providers** (`integrationProvider` enum: linear/github/slack/…). This is the closest existing "connection" registry — per-provider credentials, not per-agent. Partial-unique-index pattern handles nullable workspace scope (`schema.ts:233-243`). Config jsonb is the discriminated `IntegrationConfig` union (`types.ts:1-61`).
- **`integration_inbound_events`** (`schema.ts:257-282`): idempotency ledger keyed `(provider, externalEventId)`.
- **`skill_versions` implementation refs** (`workflow.ts:316-326`): `workflowDeploymentId | legacyAutomationId | simWorkflowExternalId | externalToolRef` — today a skill version points at *one* of four backend kinds. An "agent source" is conceptually a 5th kind of backend (an external agent harness / catalog source), or a registry that `externalToolRef`/a new `agentSourceId` resolves against.
- **`workflowEngine` enum** (`enums.ts:135-140`): `rox|sim_sidecar|legacy_automation|external_tool` — an agent-native source likely warrants a new value here or a sibling `agent_source_kind` enum (append-only).
- `objectTypeValues` (`enums.ts:249-264`) would need an appended `"agent_source"` member if agent sources participate in `object_relations` / `skill_bindings.objectType`.

**Best home: a new table in `src/schema/workflow.ts`** (it already owns skills/runs and imports orgs/users/v2Projects), or a small dedicated module `src/schema/agent.ts` re-exported from `index.ts`. It must follow the workflow.ts conventions: `uuid().primaryKey().defaultRandom()`, `organizationId` cascade FK + org index, timestamptz `created_at`/`updated_at` with `$onUpdate`, enum sourced from `enums.ts`, lifecycle `status` enum instead of `deleted_at`, `$inferInsert`/`$inferSelect` exports, and a relations block in `relations.ts`.

### Proposed `agent_sources` column sketch (convention-matched)
```ts
// enums.ts — append-only
export const agentSourceKindValues = [
  "claude_code", "codex", "cursor", "opencode", "mcp", "external_http",
] as const;
export const agentSourceKindEnum = z.enum(agentSourceKindValues);
export type AgentSourceKind = z.infer<typeof agentSourceKindEnum>;

export const agentSourceStatusValues = [
  "draft", "active", "deprecated", "archived",
] as const;
export const agentSourceStatusEnum = z.enum(agentSourceStatusValues);
export type AgentSourceStatus = z.infer<typeof agentSourceStatusEnum>;

// workflow.ts (or agent.ts) — new table
export const agentSourceKind   = pgEnum("agent_source_kind", agentSourceKindValues);
export const agentSourceStatus = pgEnum("agent_source_status", agentSourceStatusValues);

export const agentSources = pgTable("agent_sources", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  v2ProjectId: uuid("v2_project_id")
    .references(() => v2Projects.id, { onDelete: "cascade" }),       // nullable, org-wide if null
  ownerUserId: uuid("owner_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  slug: text().notNull(),
  name: text().notNull(),
  description: text(),
  kind: agentSourceKind().notNull(),
  status: agentSourceStatus().notNull().default("active"),

  // optional link to the credential it authenticates through (reuse existing store)
  integrationConnectionId: uuid("integration_connection_id")
    .references(() => integrationConnections.id, { onDelete: "set null" }),

  // typed-loose config until the agent runtime lands (mirror skill_versions jsonb defaults)
  config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  capabilities: jsonb().$type<string[]>().notNull().default([]),
  endpointUrl: text("endpoint_url"),                                 // for external_http/mcp kinds
  version: text(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("agent_sources_org_project_slug_uniq").on(t.organizationId, t.v2ProjectId, t.slug),
  index("agent_sources_org_idx").on(t.organizationId),
  index("agent_sources_project_idx").on(t.v2ProjectId),
  index("agent_sources_kind_idx").on(t.kind),
]);

export type InsertAgentSource = typeof agentSources.$inferInsert;
export type SelectAgentSource = typeof agentSources.$inferSelect;
```
Then: add `agentSourcesRelations` to `relations.ts` (org `one`, owner `one`, integrationConnection `one`; `many(skillVersions)` if skill versions gain an `agentSourceId` ref), append `agentSources: many(agentSources)` to `organizationsRelations` (`relations.ts:98-122`), optionally append `"agent_source"` to `objectTypeValues`, and run `bunx drizzle-kit generate --name="add_agent_sources"`.

For **chat-session status/labels**: add `chatSessionStatusValues` to `enums.ts` (append-only), a `chat_session_status` pgEnum, then on `chat_sessions` (`schema.ts:785-817`) add `status: chatSessionStatus().notNull().default("active")` and `labels: jsonb().$type<string[]>().default([])` (matching `tasks.labels` at `schema.ts:137`), plus an index on `(organizationId, status)`; then generate.
