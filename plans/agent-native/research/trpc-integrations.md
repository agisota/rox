# tRPC Router Conventions & Integration/Credentials Storage Model

Research for the "agent-native" port. All paths are relative to the repo root
(`packages/...`, `apps/...`). Line numbers cite the worktree
`/home/dev/1/rox-agent-native` (branch `feat/agent-native`).

---

## 1. tRPC bootstrap & context

### `packages/trpc/src/trpc.ts`
- **Context type** (`trpc.ts:10-16`):
  ```ts
  export type TRPCContext = {
    session: Session | null;   // from @rox/auth/server
    auth: typeof auth;          // better-auth instance (used by jwtProcedure)
    headers: Headers;           // raw request headers
  };
  export const createTRPCContext = (opts: TRPCContext): TRPCContext => opts;
  ```
  There is **no `db` in context** — every procedure imports the singleton `db` /
  `dbWs` from `@rox/db/client` directly.
- **Init** (`trpc.ts:18-30`): `initTRPC.context<TRPCContext>().create({...})` with
  `transformer: superjson` and an `errorFormatter` that flattens `ZodError`
  into `shape.data.zodError`.
- **Re-exports** (`trpc.ts:32-36`): `createTRPCRouter = t.router`,
  `createCallerFactory = t.createCallerFactory`, `publicProcedure = t.procedure`.

### `packages/trpc/src/root.ts`
- Builds the root with `createTRPCRouter({...})` (`root.ts:33-63`) — a flat map of
  ~31 namespace routers (see §3).
- Exports `appRouter`, `AppRouter` type, `RouterInputs = inferRouterInputs<AppRouter>`,
  `RouterOutputs = inferRouterOutputs<AppRouter>` (`root.ts:65-67`), and
  `createCaller = createCallerFactory(appRouter)` (`root.ts:69`) — server-side
  caller used by API route handlers / jobs.
- `packages/trpc/src/index.ts` is the package barrel; it re-exports `appRouter`,
  `createCaller`, the types, and the procedure builders (`adminProcedure`,
  `protectedProcedure`, `publicProcedure`, `createTRPCContext`, `createTRPCRouter`,
  `createCallerFactory`). Note `jwtProcedure` is **not** re-exported from the barrel
  (it is imported directly from `./trpc` where needed).

### `packages/trpc/src/env.ts`
- `@t3-oss/env-core` + zod schema validating server env (`env.ts:4-47`).
- **The credential-relevant var is `SECRETS_ENCRYPTION_KEY: z.string().min(1)`**
  (`env.ts:36`) — the AES key for the `secrets` table (see §6).
- Other integration-relevant vars: `GH_APP_ID` / `GH_APP_PRIVATE_KEY` /
  `GH_WEBHOOK_SECRET` (`env.ts:33-35`), `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET`
  (`env.ts:39-40`), `ANTHROPIC_API_KEY` (`env.ts:37`), `QSTASH_*` (`env.ts:24-26`),
  `BLOB_READ_WRITE_TOKEN` (`env.ts:9`). `skipValidation` honors
  `SKIP_ENV_VALIDATION` (`env.ts:46`).

### `packages/trpc/src/lib/`
- `analytics.ts` — singleton PostHog + dual-emit (PostHog + OpenPanel) `analytics` client.
- `posthog-client.ts` — PostHog node client helper.
- `github-avatar.ts` — GitHub avatar resolution helper.
- `upload.ts` — `uploadImage()` to Vercel Blob (validates PNG/JPEG/WebP, ≤4.5 MB).
- `integrations/linear/index.ts` — re-exports Linear OAuth/token helpers (e.g.
  `linearTokenResponseSchema`) for consumption by `apps/api` callbacks.
- `integrations/sync/index.ts`, `integrations/sync/tasks.ts` — task-sync helpers
  shared by integration jobs.

---

## 2. Procedure builders — what each enforces

All defined in `packages/trpc/src/trpc.ts`:

| Builder | Source | Enforces |
|---|---|---|
| `publicProcedure` | `trpc.ts:36` | Nothing — raw `t.procedure`. No auth. |
| `protectedProcedure` | `trpc.ts:38-76` | (1) `ctx.session` must exist, else `UNAUTHORIZED` (`:40-45`). (2) Resolves `activeOrganizationId`: prefers `session.session.activeOrganizationId`; if an org header (`ORGANIZATION_HEADER`, legacy `x-superset-organization-id`) names a *different* org, it verifies a `members` row for that user+org or throws `FORBIDDEN` (`:49-73`). Adds narrowed `session` and `activeOrganizationId` to ctx. |
| `adminProcedure` | `trpc.ts:133-142` | `protectedProcedure` **plus** `session.user.email` must end with `COMPANY.EMAIL_DOMAIN`, else `FORBIDDEN` (Rox-staff gate). |
| `jwtProcedure` | `trpc.ts:78-131` | Auth via **Bearer JWT** (verified through `ctx.auth.api.verifyJWT`) OR falls back to session. On success injects a *different* ctx shape: `{ userId, email, organizationIds, activeOrganizationId }` (note: **no `session` object**). Used for API-key / external-agent style calls. Throws `UNAUTHORIZED` if neither bearer nor session present. |

Key convention: **`protectedProcedure` only authenticates the user; it does NOT
authorize org-resource access.** Authorization is done per-procedure by calling
helpers like `verifyOrgMembership` / `verifyOrgAdmin` / `verifyOrgOwner`
(`packages/trpc/src/router/integration/utils.ts:7-47`), or
`requireActiveOrgMembership(ctx)` (used in the skill router), or the
`requireOrgScopedResource` / `requireOrgResourceAccess` helpers in
`packages/trpc/src/router/utils/org-resource-access.ts`.

---

## 3. Router catalog (`packages/trpc/src/router/*`)

Every key registered in `appRouter` (`root.ts:33-63`):

| Namespace | Main file | One-line purpose |
|---|---|---|
| `achievements` | `achievements/achievements.ts` | User/org achievement records. |
| `admin` | `admin/admin.ts` | Rox-staff admin dashboard ops (`adminProcedure`-gated). |
| `agent` | `agent/agent.ts` | Device/agent command lifecycle (`agentCommands` updates via Electric sync). |
| `apiKey` | `api-key/api-key.ts` | Create/list/revoke API keys for programmatic access. |
| `analytics` | `analytics/analytics.ts` | Product analytics event capture/query. |
| `automation` | `automation/automation.ts` | Legacy automations (triggers incl. `mcp`); precursor to skills. |
| `chat` | `chat/chat.ts` | Chat sessions/messages. |
| `device` | `device/device.ts` | Device registration/ownership (MCP verifies device ownership here). |
| `executionCircuit` | `executionCircuit/access.ts` (+ more) | Execution-circuit access/state. |
| `host` | `host/host.ts` | Host (compute target) registration. |
| `integration` | `integration/integration.ts` | **External-provider connections (OAuth) — see §6.** |
| `knowledge` | `knowledge/backlinks.ts` (+ more) | Knowledge graph / backlinks. |
| `notes` | `notes/notes.ts` | Notes CRUD. |
| `organization` | `organization/members.ts` (+ more) | Org + membership management. |
| `profile` | `profile/profile.ts` | User profile. |
| `project` | `project/project.ts` (+ `secrets/`) | Projects **and project secrets — see §6.** |
| `ranking` | `ranking/ranking.ts` | Leaderboards/rankings. |
| `share` | `share/share.ts` | Shareable links/resources. |
| `skill` | `skill/skill.ts` | **First-class Skill objects + bindings + runs — see §5.** |
| `support` | `support/support.ts` | Support tickets. |
| `task` | `task/statuses.ts` (+ more) | Tasks + statuses (Linear-synced). |
| `team` | `team/team.ts` | Teams. |
| `usage` | `usage/usage.ts` | Usage/billing metering. |
| `user` | `user/user.ts` | Current-user ops. |
| `v2Host` | `v2-host/v2-host.ts` | v2 host model. |
| `v2Project` | `v2-project/v2-project.ts` | v2 project model. |
| `v2Workspace` | `v2-workspace/v2-workspace.ts` | v2 workspace model. |
| `workflow` | `workflow/access.ts` (+ more) | Workflow draft/version/deploy graph. |
| `workspace` | `workspace/workspace.ts` | Workspace model. |

### `integration` sub-routers (`integration/integration.ts:18-47`)
The `integrationRouter` is a `TRPCRouterRecord` literal (not `createTRPCRouter`)
nesting per-provider routers: `github`, `linear`, `slack`, `telegram`, `discord`,
`notion`, `obsidian`, `fibery`, `lark`, plus a top-level `list` procedure.
- `integration/index.ts` just re-exports `integrationRouter`.
- `integration/shared/provider-router.ts` exports
  `createProviderConnectionRouter(provider)` — a factory yielding the standard
  `getConnection` (member) + `disconnect` (admin) pair, scoped by
  `(organizationId, workspaceId?)`. Hand-written routers (`linear`, `slack`,
  `github`) add provider-specific procedures on top.

---

## 4. How to add & register a new router/procedure

Convention is consistent across the codebase. To add a new namespace (e.g. an
`agentSource` router):

1. **Create the dir** `packages/trpc/src/router/<name>/` with `<name>.ts` and an
   `index.ts` barrel (`export { <name>Router } from "./<name>";`). Co-locate
   `schema.ts` (zod inputs), `helpers.ts`, `utils.ts`, and `*.test.ts` as siblings
   (mirrors `skill/`).
2. **Define the router** as a plain object typed
   `satisfies TRPCRouterRecord` (preferred for leaf routers, e.g.
   `skill/skill.ts:86 ... :503`, `integration/integration.ts:18-47`) **or** with
   `createTRPCRouter({...})` (used for the root). Each entry is
   `protectedProcedure.input(zodSchema).query|mutation(async ({ ctx, input }) => {...})`.
3. **Authenticate + authorize** inside each procedure: start from
   `protectedProcedure`, then call `verifyOrgMembership(ctx.session.user.id, input.organizationId)`
   (or `requireActiveOrgMembership(ctx)` to use `ctx.activeOrganizationId`), and
   gate writes with `verifyOrgAdmin` / `verifyOrgOwner` as needed.
4. **DB access**: import `{ db, dbWs }` from `@rox/db/client` (read via `db`,
   transactional writes via `dbWs`) and tables from `@rox/db/schema`. Always
   filter by `organizationId` and scope resources with the
   `org-resource-access` helpers.
5. **Register it** in `packages/trpc/src/root.ts`: add
   `import { <name>Router } from "./router/<name>";` (`root.ts:2-30`) and a key in
   the `createTRPCRouter({...})` map (`root.ts:33-63`). Keys are camelCase
   (e.g. `v2Host`). That key becomes the client call namespace (`trpc.<key>.<proc>`).
   No other wiring is needed — `AppRouter`/`RouterInputs`/`RouterOutputs` update
   automatically via inference.

---

## 5. Skill router deep-dive (`packages/trpc/src/router/skill/`)

Files: `skill.ts` (procedures), `schema.ts` (zod), `helpers.ts` (pure validators),
`run-service.ts` (execution, reused by other surfaces), `index.ts` (barrel),
`helpers.test.ts`.

### Object model (DB: `packages/db/src/schema/workflow.ts`)
- `skills` (`workflow.ts:240-287`): `id`, `organizationId`, `v2ProjectId?`,
  `ownerUserId`, `slug`, `name`, `description?`, `kind` (`skillKind`),
  `status` (`skillStatus`, default `draft`), `visibility` (`skillVisibility`,
  default `private`), `currentVersionId?` (soft pointer, **not** a FK — comment
  `:261-263`), `icon?`, `category?`. Unique `(organizationId, v2ProjectId, slug)`.
- `skillVersions` (`workflow.ts:300-362`): immutable typed contract.
  `inputSchema`/`outputSchema` (JsonSchema jsonb), **exactly one** implementation
  ref of `workflowDeploymentId` | `legacyAutomationId` | `simWorkflowExternalId` |
  `externalToolRef` (jsonb `Record<string,unknown>`), plus `documentationMd?`,
  `examples?`, `runModes`, `requiredContext`, **`requiredConnections`**,
  **`requiredSecrets`**, `policy`. The `requiredConnections`/`requiredSecrets`
  jsonb arrays (`workflow.ts:335-342`) are the declared dependency surface a skill
  has on integration connections and project secrets.
- `skillBindings` (`workflow.ts:371-398`): controlled exposure. `surface`
  (`skillBindingSurface` enum), `objectType?`, `placement?`, `label?`, `enabled`,
  `config?`. This is the **exposure gate** for agent/MCP/API surfaces.

### Procedures (`skill.ts:86-503`) — all `protectedProcedure`, all call `requireActiveOrgMembership(ctx)`
- `list(listSkillsSchema)` → `SelectSkill[]` (optional `v2ProjectId` filter).
- `get(skillIdSchema)` → one skill via `getSkillForOrg`.
- `publishWorkflow(publishWorkflowSchema)` → `{ skill, skillVersion }`: validates
  + snapshots a workflow draft into `workflowVersions`/`workflowDeployments`, then
  creates `skills` + `skillVersions` + a default `workflow_node` `skillBindings`
  row, in one `dbWs.transaction` (`:107-201`).
- `createInstructionSkill(createInstructionSkillSchema)` → `{ skill, version }`:
  non-executable doc-only skill (`:203-244`).
- `createVersion(createSkillVersionSchema)` → new version; enforces exactly-one
  impl ref via `assertExactlyOneImplementationRef` (`:246-281`).
- `promoteVersion(promoteVersionSchema)` → sets `skills.currentVersionId` (`:283-310`).
- `deprecate(skillIdSchema)` / `archive(skillIdSchema)` → status transitions.
- `getNodeDefinition(skillIdSchema)` / `listNodeDefinitions()` → workflow-node defs
  for published, `workflow_node`-bound, enabled skills (`:338-384`).
- `bind(bindSkillSchema)` → insert a `skillBindings` row (`:386-405`).
- `unbind(unbindSchema)` → delete a binding (org-scoped) (`:407-420`).
- `listBindings(listBindingsSchema)` → enabled bindings, filterable by
  `skillId`/`surface`/`objectType` (null `objectType` matches any) (`:422-446`).
- `validateRunInput(validateRunInputSchema)` → `{ valid, issues }` against the
  current version `inputSchema`.
- `run(runSkillSchema)` → delegates to `runSkill(...)` with
  `triggerKind: "manual"`; if the run pauses for approval it inserts an
  `approvalRequests` row (`:461-484`).
- `listRuns(listSkillRunsSchema)` → recent `workflowRuns` for the skill (`:486-502`).

### Schema (`skill/schema.ts`)
- `surfaceSchema = z.enum(["object_action","command_palette","workflow_node",
  "agent_tool","api","mcp"])` (`schema.ts:16-23`) — **these are the exposure
  surfaces, including `agent_tool` and `mcp`.**
- `visibilitySchema = z.enum(["private","project","organization","public"])`.
- `implementationRefSchema` (`schema.ts:26-31`): the four mutually-exclusive impl
  refs incl. `externalToolRef: z.record(z.string(), z.unknown()).optional()`.
- `runSkillSchema` (`schema.ts:94-98`): `{ skillId, input (record, default {}),
  runMode (default "manual") }`.

### `run-service.ts`
- `runSkill(args: RunSkillArgs)` (`run-service.ts:146-298`). `RunSkillArgs`
  (`:31-52`): `organizationId`, `userId`, `skillId`, `runMode`,
  `triggerKind` (`"manual"|"command"|"chat"|"schedule"|"webhook"|"api"|"mcp"`),
  `input`, optional `approvals`, `existingRunId`, **`secrets?: Record<string,string>`**,
  `v2ProjectId?`, `depth?`.
- Flow: load skill+version → `assertRunModeAllowed` → `validateInput` against
  `inputSchema` → require `workflowDeploymentId` (only workflow-backed skills are
  executable here; legacy/sim/tool wiring is separate, `:164-170`) → load deployed
  graph state → `evaluateGraphPolicy` (hard denials block, `:173-181`) →
  create/resume `workflowRuns` row → `WorkflowExecutor.execute(...)` passing
  `secrets`, `approvals`, and a `resolveSkillCall` that recursively calls
  `runSkill` (max depth `MAX_SKILL_CALL_DEPTH = 5`, `:29`) → persist terminal state
  → insert an `objectRelations` edge `(skill) --produced_run--> (run)` (`:277-287`).
- Note: **`secrets` are passed into the executor as already-decrypted plaintext**
  via `RunSkillArgs.secrets`; `runSkill` does not load/decrypt them — the caller
  must supply them (the `skill.run` procedure does not populate `secrets`).

### Helpers (`skill/helpers.ts`) — pure, throw `TRPCError`
- `assertExactlyOneImplementationRef`, `validatePublishInput`/`assertPublishable`,
  `assertRunModeAllowed`, and the **exposure gate** functions
  `bindingMatchesSurface`, `isSkillExposedVia`, `assertExposedVia`
  (`helpers.ts:118-156`) — "no enabled binding for the surface ⇒ not exposed"
  (the gate behind MCP/API/agent exposure, per inline SKILL-spec comments).

---

## 6. Integration / credentials / secrets storage model

There are **two distinct credential stores with different security postures.**

### A. `integration_connections` — OAuth connections (NOT encrypted)
DB table `packages/db/src/schema/schema.ts:189-247`
(`export const integrationConnections`):
- Columns: `id` (uuid pk), `organizationId` (FK→organizations, cascade),
  `connectedByUserId` (FK→users), `workspaceId?` (FK→workspaces; NULL = org-level),
  `provider` (`integrationProvider` enum), and the OAuth credential columns:
  - **`accessToken: text("access_token").notNull()`** (`schema.ts:208`)
  - **`refreshToken: text("refresh_token")`** (`schema.ts:209`)
  - `tokenExpiresAt: timestamp` (`schema.ts:210`)
  - `disconnectedAt`, `disconnectReason`, `externalOrgId`, `externalOrgName`,
    `config: jsonb().$type<IntegrationConfig>()` (`schema.ts:212-218`).
- **CRITICAL: `accessToken` / `refreshToken` are plain `text` columns — stored
  UNENCRYPTED.** No `encryptSecret` call on the write path. Confirmed at the Linear
  OAuth callback
  `apps/api/src/app/api/integrations/linear/callback/route.ts:88-116`, which
  inserts `accessToken: tokenData.access_token` / `refreshToken:
  tokenData.refresh_token` verbatim. Refresh path
  `packages/trpc/src/router/integration/linear/refresh.ts:94-103` likewise writes
  raw `data.access_token` / `data.refresh_token`.
- **Read path (call time):** tokens are read back as plaintext and used directly —
  no decryption step. `refresh.ts:25-107` (`refreshLinearToken`) selects
  `accessToken/refreshToken/tokenExpiresAt`, returns the access token if still
  valid (`REFRESH_BUFFER_MS`), otherwise POSTs to the provider token endpoint and
  writes new tokens. `callLinear()` (`refresh.ts:109-143`) builds
  `new LinearClient({ accessToken })` and retries once on auth error.
- **Exposure discipline:** `integration.list` and
  `createProviderConnectionRouter.getConnection` deliberately select only
  non-secret columns (`id`, `provider`, `externalOrg*`, `config`, timestamps) and
  **never return `accessToken`/`refreshToken` to clients**
  (`integration.ts:36-44`; `shared/provider-router.ts:44-49`). Secrecy is enforced
  by column-projection, not by encryption-at-rest.
- Provider enum values (`packages/db/src/schema/enums.ts:26-37`): `linear`,
  `github`, `slack`, `telegram`, `discord`, `notion`, `obsidian`, `fibery`, `lark`.
- Per-provider non-secret config typed by `IntegrationConfig` union in
  `packages/db/src/schema/types.ts:1-60` (e.g. `LinearConfig.newTasksTeamId`,
  `TelegramConfig.botUsername`).
- Uniqueness: partial uniques enforce `(organizationId, provider, workspaceId)`
  identity (`schema.ts:233-238`); a Slack-specific partial unique on
  `externalOrgId` for active connections (`schema.ts:239-243`).
- Related: `integration_inbound_events` (`schema.ts:257-277`) is a webhook
  idempotency ledger keyed `(provider, externalEventId)`.
- GitHub is the exception — it does **not** use `integrationConnections`; it has
  its own `githubInstallations`/`githubRepositories`/`githubPullRequests` tables
  (`integration/github/github.ts`), the GitHub-App credentials live in env
  (`GH_APP_*`), and the router stores/returns no raw token.

### B. `secrets` — project secrets (ENCRYPTED, AES-256-GCM)
DB table `packages/db/src/schema/schema.ts:693-720` (`export const secrets`):
- Columns: `id`, `organizationId` (FK, cascade), `projectId` (FK, cascade),
  `key: text`, **`encryptedValue: text("encrypted_value").notNull()`**
  (`schema.ts:704`), `sensitive: boolean` (default false), `createdByUserId?`,
  timestamps. Unique `(projectId, key)` (`schema.ts:716`).
- **Encryption** (`packages/trpc/src/router/project/secrets/utils/crypto.ts`):
  - `ALGORITHM = "aes-256-gcm"`, `IV_LENGTH = 12`, `AUTH_TAG_LENGTH = 16`
    (`crypto.ts:3-5`).
  - Key from **`process.env.SECRETS_ENCRYPTION_KEY`**, base64-decoded, must be
    exactly 32 bytes (`crypto.ts:7-14`).
  - `encryptSecret(plaintext)` → base64 of `iv ‖ authTag ‖ ciphertext`
    (`crypto.ts:16-28`). `decryptSecret(encrypted)` reverses it (`crypto.ts:30-41`).
- **Router** `packages/trpc/src/router/project/secrets/secrets.ts`
  (`secretsRouter`, all `protectedProcedure` + `verifyOrgMembership`):
  - `upsert({ projectId, organizationId, key, value, sensitive? })`
    (`secrets.ts:64-145`): validates key/value, enforces
    `MAX_SECRETS_PER_PROJECT` / `MAX_TOTAL_SIZE`, calls `encryptSecret(value)`
    (`:112`), inserts via `dbWs` with `onConflictDoUpdate` on `(projectId, key)`.
  - `delete({ id, organizationId })` (`secrets.ts:147-159`).
  - `getDecrypted({ projectId, organizationId })` (`secrets.ts:161-192`): the
    **read path** — loads rows, returns `decryptSecret(row.encryptedValue)` for
    non-`sensitive` rows; `sensitive` rows return `""` (write-only; value never
    leaves the server through this query).
- `decryptSecret`/`encryptSecret` are imported **only** by `secrets.ts`
  (confirmed by grep). The `secrets` map handed to the skill executor
  (`RunSkillArgs.secrets`) must be assembled/decrypted by whatever caller invokes
  `runSkill` outside this router.

### Summary of the security gap relevant to the port
- Project **secrets** are encrypted at rest (AES-256-GCM, `SECRETS_ENCRYPTION_KEY`).
- Integration **OAuth tokens** are **plaintext at rest**; confidentiality relies
  solely on never selecting those columns into client responses.

---

## 7. Seams for an "AgentSource" router

Goal: external agent surfaces ("Sources") become first-class objects with stored
credentials and namespaced MCP tools. The codebase already provides most of the
scaffolding:

1. **Object + credentials shape — two existing patterns to reuse:**
   - For an org/workspace-scoped connection with OAuth-ish credentials, mirror
     `integrationConnections` (`schema.ts:189-247`): a new table (e.g.
     `agent_sources`) with `organizationId`, optional `workspaceId`,
     `provider`/`kind`, `config` jsonb, and credential columns. **Recommendation:
     store its credentials encrypted** by reusing `encryptSecret`/`decryptSecret`
     (`secrets/utils/crypto.ts`) + `SECRETS_ENCRYPTION_KEY` — i.e. follow the
     `secrets` model, not the plaintext `integrationConnections` model. (Consider
     promoting `crypto.ts` out of `router/project/secrets/utils/` into a shared
     `lib/` so both stores share it.)
   - For per-project key/value credentials, the `secrets` table + `secretsRouter`
     already work and can be referenced from a skill via
     `skillVersions.requiredSecrets` (`workflow.ts:339-342`).

2. **A new `agentSource` router** following §4: dir
   `packages/trpc/src/router/agent-source/` with `agentSource.ts` + `schema.ts` +
   `index.ts`; register as `agentSource: agentSourceRouter` in `root.ts:33-63`.
   Reuse `createProviderConnectionRouter`
   (`integration/shared/provider-router.ts`) as the template for
   `create`/`list`/`getConnection`/`connect`/`disconnect`, all `protectedProcedure`
   + `verifyOrgMembership`/`verifyOrgAdmin`, projecting out raw credentials in read
   responses (the `integration.list` pattern, `integration.ts:36-44`).

3. **Exposing a Source's MCP tools — the binding system already models this.**
   The `skillBindings.surface` enum **already includes `"mcp"` and `"agent_tool"`**
   (`skill/schema.ts:16-23`; DB enum `skillBindingSurface` in `workflow.ts:382`).
   The exposure gate `isSkillExposedVia` / `assertExposedVia`
   (`skill/helpers.ts:136-156`) is the single chokepoint for "is this exposed as an
   MCP/agent tool?". `skill.run`/`runSkill` already accept `triggerKind: "mcp"`,
   and `"agent_tool"` is a valid run mode/surface. A Source's tools can therefore
   be modeled as skills (or skill bindings) namespaced by the Source, surfaced via
   the existing `listNodeDefinitions`/`listBindings` queries and run through
   `runSkill`. (There is currently **no dedicated MCP DB table** — MCP is purely a
   binding surface + a `triggerKind`.)
   - `skillVersions.externalToolRef` (jsonb, `workflow.ts:325-326`;
     `implementationRefSchema`, `schema.ts:26-31`) is the natural place to point a
     skill at an external/MCP tool definition owned by an AgentSource.
   - `skillVersions.requiredConnections` (`ConnectionRequirement[]`,
     `workflow.ts:335-338`) is the declared link from a skill to the
     connection/source whose credentials it needs at run time.

4. **Wiring credentials into execution.** `runSkill`'s `RunSkillArgs.secrets`
   (`run-service.ts:49`) is the injection point — the caller resolves a Source's
   required connections/secrets (decrypting via `decryptSecret`) and passes the
   plaintext map to `runSkill`, which forwards it to `WorkflowExecutor.execute`.
   An AgentSource invocation path would perform the resolve-then-inject step the
   current `skill.run` procedure leaves to its caller.

5. **Object graph + relations.** New Source objects can participate in the existing
   `objectRelations` edge table (`workflow.ts:600-634`) — e.g.
   `(agent_source) --exposes--> (skill)` or `(skill) --requires--> (agent_source)` —
   provided the relevant `objectType` enum values are added (the `objectType` enum
   lives in `packages/db/src/schema/enums.ts`; `objectTypeValues` is consumed by
   `skill/schema.ts:1`).

6. **Auth surface for external agents.** Calls originating from an external agent
   should use **`jwtProcedure`** (`trpc.ts:78-131`, Bearer-JWT/API-key style),
   which yields `{ userId, email, organizationIds, activeOrganizationId }` instead
   of a `session`. An AgentSource router exposed to agents must branch on that ctx
   shape rather than `ctx.session.user`.
