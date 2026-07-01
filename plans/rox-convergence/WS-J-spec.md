# WS-J: MCP v2 + Org Collaboration — Spec

> Read-only discovery + Phase-2 task spec. Owner-locked decisions (hybrid host model, Turso scoped to cross-host agent-state, 2-phase parallel worktrees, unify-not-delete) are taken as given.

---

## 1. Findings (evidence-backed)

### 1.1 What MCP v2 is, in depth

**Two distinct Rox MCP servers exist today** — they are NOT the same thing:

| | v1 (`packages/mcp`) | v2 (`packages/mcp-v2`) |
|---|---|---|
| Server name | `rox` | `rox-v2` (`server.ts:21`) |
| Route | `/api/agent/[transport]` (`apps/api/.../agent/[transport]/route.ts`) | `/api/v2/agent/[transport]` (`apps/api/.../v2/agent/[transport]/route.ts`) |
| Tool surface | devices/tasks/orgs (older "devices" model) | tasks/agents/workspaces/terminals/automations/hosts/screen/projects/org-members (host-model native) |
| Proxy layer | none | **yes** — augments native tools with per-org downstream MCP servers |
| Auth | better-auth OAuth via `auth-flow.ts` | `resolveMcpContext` (api-key `sk_*` OR OAuth JWT) → mints short-lived user JWT (`auth.ts:199`) |

**The v2 proxy layer** (`server.ts:45 createProxyMcpServer`): on every request it builds the native `rox-v2` server, then constructs an `AgentSourcePool`, calls `pool.connectAll(ctx)`, and `registerProxyTools(server, connected)` (`proxy-tools.ts:128`). Downstream tools are re-exposed under `mcp__{slug}__{tool}` (`proxy-tools.ts:19 namespacedToolName`); each proxy handler strips the prefix and forwards the call verbatim to the pooled downstream client with the ORIGINAL name (`proxy-tools.ts:97-111`). Input validation is a passthrough `z.looseObject({})` (`proxy-tools.ts:42`) — the downstream source does real validation. Per-source failures are isolated into `result.failures` and never block healthy sources (`proxy-tools.ts:134-145`, `agent-source-pool.ts:524-526`). The route closes the whole pool after each stateless JSON-RPC message (`v2/agent/.../route.ts:78 cleanup()`); it is stateless per request.

**WHOSE downstream servers are these?** They are **org-configured external agent backends**, stored in the `agent_sources` table (`packages/db/src/schema/agent.ts:52`). Each row is org-scoped (+ optional `v2_project_id`) with `kind ∈ {claude_code, codex, cursor, opencode, mcp, external_http}` (`enums.ts:425`). So a source is either (a) a remote MCP/HTTP endpoint an org admin registers (`kind: mcp|external_http`, with `endpointUrl` + AES-encrypted header credentials in `encrypted_config`), or (b) a local/native `rox`/`rox_v2` source served in-process (`agent-source-pool.ts:98 IN_MEMORY_KINDS`). They are **organization-owned external MCP servers** — the org's connected tool backends (e.g. a company's internal MCP, GitHub MCP, etc.), surfaced to any agent/client that connects to Rox over MCP. Credentials NEVER appear in the `agentSource.list` projection (`agentSource.ts:27`); they are loaded server-side only via `loadRuntimeAgentSourceCredentials` (`agent-source-pool.ts:393`), decrypted with `decryptSecret` and injected as HTTP headers (`agent-source-pool.ts:377-383`).

**How `agent-source-pool` works** (`agent-source-pool.ts:459 AgentSourcePool`):
- `connectAll(ctx)`: resolves active sources via tRPC `agentSource.list` (filtered to `status==="active"`, `agent-source-pool.ts:75-95`), then for each slug not already pooled, connects with a bounded retry (`connectMaxAttempts=2`) + per-source timeout (`10s`) + exponential backoff (`agent-source-pool.ts:491-529`).
- Connector selection (`defaultAgentSourceConnector`, `:429`): `rox`/`rox_v2` → in-memory adapter (`createInMemoryDownstreamClient`, spins an in-process `rox-v2` server over `InMemoryTransport`, wiring the same org-scoped `mcpContext` — no network, `:314`); everything else → external HTTP adapter (`createExternalDownstreamClient`, `:361`) over `StreamableHTTPClientTransport`.
- **SSRF hardening**: `validateExternalEndpointUrl` (`:181`) forces HTTPS, blocks `localhost`/`.localhost`, DNS-resolves and rejects private/reserved IP ranges (`:166 isRestrictedEndpointAddress`), and sets `redirect: "error"`.
- Failures isolated in `getFailures()`; `cleanup()` closes all clients (`:547`).

**How tools re-expose at `/api/v2/agent`:** route → `resolveMcpContext` → `createProxyMcpServer` → native tools (`registerTools`) + proxy tools (`mcp__{slug}__{tool}`) → `WebStandardStreamableHTTPServerTransport`. PostHog `mcp_tool_called` telemetry is emitted per call via the `onToolCall` emitter wired through `define-tool.ts:55 emitToolCall` (`v2/agent/.../route.ts:43-60`).

### 1.2 Full list of Rox NATIVE tools (from `tools/register.ts`)

Registered set (`register.ts:37 REGISTRARS`). Each maps to a tRPC caller (`createMcpCaller`) or a host-service call (`hostServiceCall` via the relay):

| MCP tool name | What it lets you DO | Source |
|---|---|---|
| `tasks_list` | List/filter org tasks (status/priority/assignee/`assigneeMe`/`creatorMe`/search) | `tasks/list.ts` |
| `tasks_get` | Fetch one task | `tasks/get.ts` |
| `tasks_create` | Create a task (title/desc/status/priority/assignee/estimate/due/labels) | `tasks/create.ts:8` |
| `tasks_update` | Update a task | `tasks/update.ts` |
| `tasks_delete` | Delete a task | `tasks/delete.ts` |
| `tasks_statuses_list` (statuses/list) | List the org's task statuses (to resolve a `statusId`) | `tasks/statuses/list.ts` |
| `organization_members_list` | Look up member id by name/email (for assignment) | `organization/members/list.ts:10` |
| `automations_list/get/get_prompt/create/update/set_prompt/delete/pause/resume/run/logs` | Full CRUD + lifecycle on **recurring agent runs** (RRULE-scheduled). `create` (`automations/create.ts:10`) schedules a prompt on a host into a fresh or existing workspace; `run` dispatches immediately (`automations/run.ts:10`); `logs` tracks runs | `automations/*` |
| `workspaces_list/create/update/delete` | A workspace = a branch-scoped git worktree on a host. `create` (`workspaces/create.ts:30`) materializes the worktree and can optionally spawn `agents` and/or run a one-off `command` in the same call | `workspaces/*` |
| `agents_create` | Launch an agent session (preset `claude`/`codex`/`rox` or HostAgentConfig UUID) with a prompt in an existing workspace (`agents/create.ts:10`) | `agents/create.ts` |
| `agents_list` | List agent presets/instances | `agents/list.ts` |
| `terminals_create` | Open a PTY / run a one-off shell command in a workspace worktree (`terminals/create.ts:10`) | `terminals/create.ts` |
| `projects_list` | List projects (a project = a checked-out repo) — to get a `projectId` (`projects/list.ts:8`) | `projects/list.ts` |
| `hosts_list` | List registered machines (hosts) the user can reach — to get a `hostId` (`hosts/list.ts:8`) | `hosts/list.ts` |
| `rox_get_screen_context` | Read the screen the user is looking at for a workspace (route, active workspace, selected text) — `found:false` if not open (`screen/get_context.ts:16`) | `screen/get_context.ts` |
| `rox_ui_command` | Drive the Rox app for a workspace; allow-listed `navigate` only, executed in the user's renderer and acked back (`screen/ui_command.ts:10`) | `screen/ui_command.ts` |

This is a **full remote control surface for the host model**: list machines/projects → create a worktree → spawn agents & terminals → schedule recurring runs → drive the desktop UI → manage tasks. Host-touching tools (`agents/terminals/workspaces/screen`) resolve the owning host via `v2Workspace.getFromHost` and call it through the relay (`hostServiceCall`, `ctx.relayUrl`).

### 1.3 Is the Rox MCP server preinstalled + launched with the desktop app per user?

**No — not as a local per-user process. It is consumed as a REMOTE HTTP endpoint.** Traced:
- The default workspace MCP seed set (`packages/host-service/.../shared/setup-mcp.ts:55 DEFAULT_MCP_SERVERS`) includes an entry `name: "rox"` of `transport: "http"` pointing at **`https://api.zed.md/mcp`** (`setup-mcp.ts:83-86`) — i.e. the hosted v1 Rox MCP, reached over HTTP/SSE with no local process. It is written into each new workspace's `.mcp.json` (Claude) and `.codex/config.toml` (Codex) by `seedWorkspaceMcpServers` (`setup-mcp.ts:132`).
- The desktop "preinstall" path (`apps/desktop/src/main/index.ts:496-509` → `lib/preinstall-catalog`) installs **skills + subagents** into the user's global Claude catalog and writes a "Rox preinstalled tool shim" (`preinstall-catalog.ts:279`) — it does NOT spawn a local Rox MCP server.
- The v2 server is invoked only as a Next.js route handler inside `apps/api` (`/api/v2/agent/[transport]`), constructed fresh per request and torn down after each message. There is no daemonized local MCP binary.

**Gap/maturity note:** the seeded `rox` endpoint is **v1** (`api.zed.md/mcp`), not v2. There is no client config anywhere that points at `/api/v2/agent`. So v2's richer proxy + host-native tools are not yet wired into the desktop's seeded agents. This is a convergence gap WS-J should close.

### 1.4 How to develop the v2 direction

- **Unit-testable by design**: pool and proxy are side-effect-free to import (lazy `import("./caller")`, `import("./server")`) so they can be exercised with an injected `connector`/`resolveSources` mock (`agent-source-pool.ts:441 AgentSourcePoolOptions`, see `proxy-tools.test.ts`). New native tools follow the `defineTool` + `register()` pattern (`tools/register.ts:78`) and a per-tool folder.
- **Add a native tool**: create `tools/<group>/<name>.ts` exporting `register(server)`, add it to `REGISTRARS` (`register.ts:37`). Back it with a tRPC procedure via `createMcpCaller(ctx)` or a relay `hostServiceCall`.
- **Local run**: `/api/v2/agent` is just a Next route in `apps/api`; run `apps/api` dev and point an MCP client (Claude/Codex/Cursor) at `https://<api>.t/api/v2/agent/mcp` with a `sk_*` API key or OAuth.
- **Verify**: `bun test packages/mcp-v2`; for proxy behavior use the mock connector pattern in `proxy-tools.test.ts`.

### 1.5 Use cases

- **External IDE clients calling Rox tools over MCP**: a developer in Claude Code / Cursor / Codex (or any MCP client) connects to `/api/v2/agent` and gets one unified toolset that (a) controls their Rox host fleet — spin up worktrees, launch agents, open terminals, schedule automations, drive the desktop UI — and (b) transparently fans out to every external MCP server their org has registered (`mcp__{slug}__{tool}`). One endpoint, org-scoped, credential-isolated. This is the bridge that lets non-Rox IDEs drive Rox and the org's whole tool estate.
- **Org/project collaboration**: because sources, tasks, members, automations and (proposed) skill-libraries/dashboards are all org-scoped, every member's IDE shares the same source-of-truth tool surface. A teammate's registered external MCP, the team's skill library, and the shared project dashboard all become callable/visible through the same proxy — turning per-developer tooling into a shared org capability.

### 1.6 DESIGN: org skill libraries + collaborative dashboard (current state)

**Skills already exist** but are flatly org/project-scoped: `skills`, `skill_versions`, `skill_bindings` live in `packages/db/src/schema/workflow.ts:247/307/382`. A skill has `organizationId`, optional `v2ProjectId`, `ownerUserId`, `visibility ∈ private/...`, `currentVersionId`, and exposure surfaces via `skill_bindings.surface` (`workflow.ts:393`). **There is NO library grouping and NO team assignment today** (grep for `skillLibrar`/`teamSkill`/`dashboard` in `packages/db/src/schema` → empty). Teams DO exist (`auth.ts:147 teams`, `:170 team_members`) and users have an `activeTeamId` (`auth.ts:56`). The notebook/knowledge layer (`knowledge_documents`, `knowledge_links` in `schema/knowledge.ts`) is the closest existing "shared artifacts" surface and should be the dashboard's document substrate (do not duplicate it).

This is the design gap WS-J fills: (a) **skill libraries** = named groupings of skills, multiple per org, each assignable to a team; (b) a **collaborative org/project dashboard** = shared source of truth (configs, recommendations, notes, priorities, digital artifacts, products, references, logs).

---

## 2. Target design

### 2.1 MCP v2 request flow (sequence)

```
IDE/agent (Claude/Codex/Cursor)         apps/api /api/v2/agent          mcp-v2 (pkg)            downstream
        |                                       |                            |                       |
        |-- JSON-RPC (Bearer sk_*/JWT) -------->|                            |                       |
        |                                  resolveMcpContext (auth.ts)       |                       |
        |                                  mint short-lived user JWT --------|                       |
        |                                       |-- createProxyMcpServer --->|                       |
        |                                       |            registerTools (native)                  |
        |                                       |            pool.connectAll(ctx)                     |
        |                                       |               resolveActiveAgentSources (tRPC list) |
        |                                       |               connector per kind:                   |
        |                                       |                 rox/rox_v2 -> in-memory rox-v2 srv   |
        |                                       |                 mcp/external_http -> HTTPS (SSRF gd) |--> external MCP
        |                                       |            registerProxyTools -> mcp__{slug}__{tool}|
        |<-- tools/list (native + proxied) -----|                            |                       |
        |-- tools/call mcp__github__x --------->|  strip prefix -> client.callTool(original) -------->|--> external MCP
        |<-- result + PostHog mcp_tool_called --|         cleanup() closes pool                       |
```

### 2.2 Skill-library + dashboard data model (ERD — hand to WS-O for schema ownership)

```
organizations 1───* skill_libraries ──────────┐
                         │ id, org_id, slug, name, description,
                         │ visibility, owner_user_id, ts
                         │
   skill_libraries 1───* skill_library_items   (library membership; many libs can hold same skill)
                         │ library_id -> skill_libraries.id
                         │ skill_id    -> skills.id
                         │ position int, ts
                         │
   skill_libraries 1───* skill_library_team_assignments  (a library assigned to a team)
                         │ library_id -> skill_libraries.id
                         │ team_id     -> auth.teams.id
                         │ org_id (denormalized for Electric shape-filter, mirrors team_members)
                         │ assigned_by_user_id, ts
                         └─ unique(library_id, team_id)

organizations 1───* dashboards (collaborative source-of-truth board)
   dashboards.org_id, v2_project_id?(set-null), slug, name, ts
   dashboards 1───* dashboard_sections   (typed lanes)
        section.kind ∈ config|recommendation|note|priority|artifact|product|reference|log
        section.dashboard_id, position, title, ts
   dashboard_sections 1───* dashboard_entries
        entry.section_id, dashboard_id(denorm), org_id(denorm),
        body jsonb, knowledge_document_id?(-> knowledge_documents, set-null),  // reuse notebook docs
        status text?, priority text?, created_by_user_id, position, ts
```

Design rules to hand to WS-O: org cascade FK + org index on every table; `v2_project_id` set-null where project-scoped; denormalize `organization_id` onto team-joined + entry tables so ElectricSQL shape-filtering works (same trick as `team_members.organization_id`, `auth.ts:186`); `dashboard_entries.knowledge_document_id` REUSES `knowledge_documents` rather than duplicating MDX storage. New enums in `enums.ts`: `dashboard_section_kind`. No new migrations authored by WS-J — schema PR is WS-O's.

### 2.3 Surfaces

- **MCP**: new native tools `skill_libraries_list`, `skill_libraries_get`, `dashboard_get`, `dashboard_list` so external IDE clients can read the team's library + shared board. (Write/admin stays in the web/desktop UI + tRPC; MCP surface is read-first for safety.)
- **tRPC (owned here)**: `mcpAdmin` router (introspection of proxy state), `skillLibrary` router (CRUD + team assignment), `dashboard` router (CRUD on dashboards/sections/entries) — all `protectedProcedure` + `requireActiveOrgMembership`.
- **Web/desktop UI**: rendered by WS that owns those apps; WS-J only ships the routers + MCP tools + the schema proposal.

---

## 3. Phase-2 implementation tasks (TDD, bite-sized)

> All new MCP tools follow `defineTool` + per-folder `register()` + add to `REGISTRARS` (`packages/mcp-v2/src/tools/register.ts:37`). All routers follow the `agentSource.ts` pattern: `protectedProcedure`, `requireActiveOrgMembership`, zod schema in a sibling `schema.ts`, registered in `packages/trpc/src/root.ts`.

**T1 — Point seeded agents at v2 (convergence fix).** Modify `packages/host-service/src/trpc/router/workspace-creation/shared/setup-mcp.ts`: change the `rox` default server URL from `https://api.zed.md/mcp` to the v2 endpoint (env-driven `ROX_MCP_V2_URL` default `https://api.zed.md/api/v2/agent/mcp`), keep `transport:"http"`. Test: extend `setup-mcp.test.ts` to assert the `rox` entry resolves to the v2 URL in both `.mcp.json` and `config.toml`. Expected: new workspaces' Claude/Codex agents call v2 (native + proxy tools), not v1.

**T2 — `skillLibrary` tRPC router.** Create `packages/trpc/src/router/skill-library/{index.ts,skillLibrary.ts,schema.ts,skillLibrary.test.ts}`; register in `root.ts`. Procedures: `list`, `get`, `create`, `update`, `delete`, `addSkill`, `removeSkill`, `assignTeam`, `unassignTeam`, `listForTeam`. Each calls the WS-O tables (`skill_libraries`, `skill_library_items`, `skill_library_team_assignments`). Test: DB-free zod-schema tests + caller-harness tests mirroring `agentSource.test.ts` (org-scope enforcement, team-assignment uniqueness). Expected: an org can have N libraries, each assignable to a team; `listForTeam(teamId)` returns that team's libraries' skills.

**T3 — `dashboard` tRPC router.** Create `packages/trpc/src/router/dashboard/{index.ts,dashboard.ts,schema.ts,dashboard.test.ts}`; register in `root.ts`. Procedures: `list`, `get` (with sections+entries), `create`, `update`, `delete`, `createSection`, `updateSection`, `reorderSections`, `upsertEntry`, `deleteEntry`, `reorderEntries`. `upsertEntry` optionally links a `knowledgeDocumentId`. Test: zod tests for section-kind enum + caller tests for org-scope + entry→section integrity. Expected: a shared board with typed lanes (config/recommendation/note/priority/artifact/product/reference/log) and entries that can embed notebook docs.

**T4 — MCP native read tools for libraries.** Create `packages/mcp-v2/src/tools/skill-libraries/{list.ts,get.ts}` calling `caller.skillLibrary.list/get`; add to `REGISTRARS`. Test: register-and-list assertion (the tool appears in `tools/list`) + handler returns org-scoped rows via a mocked caller. Expected: `skill_libraries_list` / `skill_libraries_get` callable over MCP.

**T5 — MCP native read tools for dashboard.** Create `packages/mcp-v2/src/tools/dashboard/{list.ts,get.ts}` calling `caller.dashboard.list/get`; add to `REGISTRARS`. Test: same pattern as T4. Expected: `dashboard_list` / `dashboard_get` callable over MCP, returning the shared board for the active org/project.

**T6 — `mcpAdmin` introspection router + tool.** Create `packages/trpc/src/router/mcp/{index.ts,mcp.ts,schema.ts,mcp.test.ts}` with `proxyStatus` (returns active agent-source slugs + last connection failures) by reusing `AgentSourcePool` against the caller's ctx; register in `root.ts`. Add native MCP tool `packages/mcp-v2/src/tools/mcp/proxy_status.ts`. Test: pool with a mock connector that fails one source → assert `failures` surfaced; tool registration test. Expected: clients can see which downstream sources are healthy without leaking credentials (`endpointUrl`/slug only, never `encryptedConfig`).

**T7 — Proxy hardening: per-tool source-failure surfacing in `tools/list`.** Modify `packages/mcp-v2/src/proxy-tools.ts` to (optionally) register a synthetic informational note when `registerProxyTools` returns non-empty `failures`, so a client sees a degraded source instead of silent omission. Test: extend `proxy-tools.test.ts` — one failing source still registers healthy tools AND exposes a failure marker. Expected: graceful, observable degradation (no behavior change to healthy paths).

**T8 — Wire library/dashboard into v1 parity (optional, P2).** Mirror the new native read tools into `packages/mcp` (v1 `tools/`) ONLY if v1 must stay reachable during migration; otherwise document v1 as frozen. Test: parity test asserting tool-name stability. Expected: no orphaned v1 clients during the api.zed.md→v2 cutover.

**T9 — Investigate `rox`/`rox_v2` agent-source kinds (per D8 — resolve dead-code-vs-enum).** `IN_MEMORY_KINDS = {rox, rox_v2}` (`agent-source-pool.ts:98`) are NOT valid `agent_source_kind` enum values (`enums.ts:425-431` = `{claude_code, codex, cursor, opencode, mcp, external_http}`), so the in-memory connector branch is unreachable via a real DB row today (§7b). During implementation, trace whether anything references these kinds on a live path (a real `agent_sources` row, a seed, or a runtime construction). **If referenced:** hand the enum-value add (`rox`, `rox_v2`) to **WS-O** to append in `packages/db/src/schema/enums.ts` (WS-J does NOT edit schema). **If not referenced:** remove the dead `IN_MEMORY_KINDS` branch + the in-memory connector path as dead code. Test: either a DB-row-backed in-memory connector test (if kept) OR a regression test confirming the path is gone. Expected: no silent dead code; the in-memory rox path is either valid end to end or removed. Resolves residual #8.

---

## 4. File ownership (Phase-2, merge isolation)

WS-J **owns and may modify**:
- `packages/mcp-v2/**` (all native tools, proxy, pool, server, auth, define-tool; new dirs `tools/skill-libraries/`, `tools/dashboard/`, `tools/mcp/`)
- `packages/mcp/**` (v1 — only if T8 is executed; otherwise read-only)
- `packages/trpc/src/router/mcp/**` (NEW)
- `packages/trpc/src/router/skill-library/**` (NEW)
- `packages/trpc/src/router/dashboard/**` (NEW)
- `packages/trpc/src/root.ts` (append-only: register the 3 new routers — coordinate merge order; this is the one shared file, keep edits to additive import+spread lines)
- `packages/host-service/src/trpc/router/workspace-creation/shared/setup-mcp.ts` + `setup-mcp.test.ts` (T1 only — coordinate with any host-service workstream)

WS-J **does NOT touch** (hand off): `packages/db/src/schema/**` (all new tables/enums → **WS-O**), `apps/web/**` + `apps/desktop/**` UI surfaces (owned by the web/desktop convergence workstreams), `apps/api/src/app/api/v2/agent/**` route file (stable; no change needed for these tasks).

---

## 5. Dependencies + suggested wave

- **Depends on WS-O (schema)** for T2–T5: `skill_libraries`, `skill_library_items`, `skill_library_team_assignments`, `dashboards`, `dashboard_sections`, `dashboard_entries`, enum `dashboard_section_kind`. WS-J authors the table *proposal* (section 2.2) and hands it to WS-O; WS-O runs `drizzle-kit generate`. WS-J's routers import from `@rox/db/schema` once WS-O merges.
- **Coordinates with** the host-service workstream for T1 (`setup-mcp.ts`) and the web/desktop workstreams for consuming the new routers in UI.
- **Independent / no dep**: T1 (config URL), T6, T7 (proxy/pool only — `packages/mcp-v2` internal).
- **Suggested waves**:
  - **P0**: T1 (v1→v2 seed cutover), T7 (proxy degradation visibility) — pure mcp-v2/host-service, no schema.
  - **P1**: T2, T3 (routers) after WS-O schema lands; T6 (mcpAdmin).
  - **P2**: T4, T5 (MCP read tools, depend on T2/T3), T8 (v1 parity/freeze).

Merge order: **WS-O schema → WS-J P1 routers → WS-J P2 tools**. The only cross-workstream shared file is `packages/trpc/src/root.ts` (additive registrations).

---

## 6. Target PR

- Branch: `feat/ws-j-mcp-v2-org-collaboration`
- PR title: `feat(mcp-v2): unify v2 MCP proxy + org skill libraries & collaborative dashboard`

---

## Decision updates (resolved forks — see `DECISIONS.md`)

- **D8 (technical) — investigate `rox`/`rox_v2` agent-source kinds.** Captured as **T9**: during impl,
  determine whether the in-memory `rox`/`rox_v2` kinds are on a live path. If referenced → hand the
  `agent_source_kind` enum-value add to **WS-O** (`enums.ts`); else remove the dead in-memory branch. WS-J
  never edits schema. Resolves residual #8.
- **D3 (owner) — collab/RTC feed this dashboard.** WS-L now ships LiveBlocks (presence/cursors) AND LiveKit
  (voice) in **P1** (both, this plan), and mounts presence on the collaborative dashboard surface WS-J
  defines (T3 `dashboard` router + WS-O `dashboards`/`dashboard_entries` tables). Durable content stays in the
  WS-J/WS-O tables; LiveBlocks is the ephemeral layer on top. No new WS-J work — just confirming the
  dashboard is the mount target for WS-L T10.

---

## 7. Hardening review

> Read-only verification pass against actual code (2026-06-20). Verified the factual claims in §1–§4 by reading the cited files. The architecture narrative is sound; line numbers drift by ±1–3 in several places (cosmetic), but two substantive claims are wrong and one router-pattern citation is wrong.

### 7a. Factual corrections (file:line)

1. **§1.3 — the "Rox preinstalled tool shim (`preinstall-catalog.ts:279`)" claim is fabricated.** `grep` for `shim`/`tool shim`/`preinstall` in `apps/desktop/src/main/lib/preinstall-catalog.ts` returns nothing, and the cited line 279 area is empty/out of range. The real path: `apps/desktop/src/main/index.ts:45` imports `ensureCatalogInstalled` and calls it at **`index.ts:494`** (not "496-509"); it installs **skills + subagents** into `~/.claude` (console.info confirms "N skills, M subagents"). **No tool shim is written.** The section's CONCLUSION (no local Rox MCP process is spawned; v2 is a remote HTTP route) remains correct — only the shim sub-claim and line refs are wrong.

2. **§2.3 / §3 / §150 preamble — wrong router pattern citation.** The spec says new routers follow "the `agentSource.ts` pattern: `protectedProcedure`, `requireActiveOrgMembership`". But `packages/trpc/src/router/agent-source/agentSource.ts` does NOT use `requireActiveOrgMembership` — it enforces org access with `verifyOrgMembership(ctx.session.user.id, input.organizationId)` (**agentSource.ts:118**) and takes `organizationId` as an explicit input. The `requireActiveOrgMembership` helper lives in `packages/trpc/src/router/utils/active-org.ts` and is used by a DIFFERENT family of routers (`skill.ts`, `journal.ts`, `memory.ts`, `pipeline/*`, `graph.ts`, `runtime.ts`, `organization/members.ts`). WS-J must pick ONE consciously: the active-org pattern (derives org from `ctx`, no `organizationId` input — better for the team/library/dashboard surfaces) is the closer fit and is what the existing `skill` router already uses. Update §2.3/§3 to cite `requireActiveOrgMembership` + `router/skill/skill.ts` as the pattern source, not `agentSource.ts`.

3. **§1.1 line drift (cosmetic, fix for precision):** `server.ts` names `rox-v2` at **line 20** (spec says `:21`). Route `cleanup()` is at **route.ts:79** (spec says `:78`). `setup-mcp.ts` `rox`/`api.zed.md/mcp` entry is at **lines 83-85** (`name`/`url` at 84-85; spec says `:83-86`). `register.ts` registration loop is at **78-79**, `registerTools` fn at **73** (spec's `:78` points at the loop body, fine). `team_members.organizationId` field is ~**auth.ts:184-188** (spec says `:186`). All other cited lines verified exact: `proxy-tools.ts` 19/42/128/134-145 ✓, `agent-source-pool.ts` 98/166/181/314/361/393/429/459/491 ✓, `enums.ts:425` (and `mcp` kind IS present at line 430 ✓ — spec correct), `agent.ts:52` ✓, `auth.ts:199` mintUserJwt ttl 300s ✓, `define-tool.ts:55` emitToolCall ✓, `workflow.ts` 247/307/382 + surface 393 ✓, `knowledge.ts:64` ✓, `auth.ts` teams 147 / team_members 170 / activeTeamId 56 ✓, native tool names (`tasks_list`, `rox_get_screen_context`, `rox_ui_command`, `organization_members_list`, `automations_create` RRULE) ✓.

4. **§1.1 SSRF detail (minor):** spec says the validator blocks `localhost`/`.localhost`; actual `RESTRICTED_HOSTNAMES` (agent-source-pool.ts:102) is `{localhost, localhost.localdomain}` — `.localhost` subdomains are handled by `normalizeHostname` logic, not the literal set. Reword to "blocks `localhost` + private/reserved IPs after DNS resolution" to match `isRestrictedEndpointAddress`.

### 7b. Questions not fully answered

- **Existing `skill` router collision.** A full `skill` router already exists (`packages/trpc/src/router/skill/{skill.ts,helpers.ts,run-service.ts,schema.ts}`, registered `root.ts:71`). The spec never references it. Does `skillLibrary` extend/compose it, or is it parallel? §2.3/§3 should state the relationship (e.g., `skillLibrary.addSkill` validates `skillId` against the existing `skill` router's ownership rules) to avoid two divergent org-scope models.
- **`requireActiveOrgMembership` vs explicit `organizationId`.** Tied to correction #2 — which org-resolution contract do the new routers use? This changes every procedure signature in T2/T3/T6 and the MCP tool inputs in T4/T5 (whether they pass `organizationId` or rely on `ctx`).
- **T6 `mcpAdmin.proxyStatus` cost.** It proposes "reusing `AgentSourcePool` against the caller's ctx" — but `connectAll` actually dials every downstream source (10s timeout each, real network). A status endpoint that opens+closes all org connections on each call is expensive and SSRF-exercising. Should it instead read last-known health (cached) rather than live-connect? Not addressed.
- **v1 vs v2 enum kinds.** `IN_MEMORY_KINDS` = `{rox, rox_v2}` (agent-source-pool.ts:98) but `agent_source_kind` enum (enums.ts:425-431) = `{claude_code, codex, cursor, opencode, mcp, external_http}` — neither `rox` nor `rox_v2` is a valid enum value. So the in-memory branch is currently unreachable via a real DB row. The spec presents in-memory rox sources as a live path; is this dead code, or is a `rox`/`rox_v2` enum addition pending (and whose ownership)? Unanswered.

### 7c. Merge-safety / file-ownership overlap check

Cross-checked WS-J's OWNS list (`packages/mcp-v2/**`, `packages/mcp/**`, `packages/trpc/src/router/{mcp,skill-library,dashboard}/**`, `packages/trpc/src/root.ts`, host-service `setup-mcp.ts`) against the sibling-workstream boundaries stated in the brief.

- **No overlap with WS-A…WS-I, WS-K…WS-N on the mcp/trpc paths** — those packages are WS-J-exclusive here. ✓
- **Schema is correctly handed to WS-O.** WS-J authors NO files under `packages/db/src/schema/**` (the new `skill_libraries*` / `dashboards*` tables + `dashboard_section_kind` enum all go to WS-O). The economy.ts=WS-E carve-out is not touched by WS-J. ✓ No schema overlap.
- **`packages/trpc/src/root.ts` is the one genuinely shared file** (additive router registrations). WS-J flags this itself (§4, §197). **Risk:** any sibling that also registers a router (WS-O when wiring schema-backed routers, or any workstream adding a tRPC surface) will collide on `root.ts` import+spread lines. Mitigation already correct (append-only, additive). **Flag: confirm WS-O does not also edit `root.ts`; if it does, define a merge order (WS-O imports first).**
- **`packages/host-service/.../setup-mcp.ts` (T1)** — host-service is not in the explicit sibling list. If any host-service/desktop-convergence workstream owns `packages/host-service/**`, T1 overlaps. **Flag: confirm setup-mcp.ts ownership before T1; the spec already says "coordinate with any host-service workstream" (§181) — keep that as a hard gate.**
- **NEW finding (not a file overlap but a logical one):** the existing `skill` router (`packages/trpc/src/router/skill/**`) is owned by whichever workstream owns skills/workflow. WS-J's new `skill-library` router reads `skills` rows and the existing `skill` router's helpers. **Flag: coordinate read-contract with the skill-router owner so the two don't fork org-scope semantics.**

**Net: no hard file-ownership overlap with the lettered siblings or WS-O schema. Two coordination risks: shared `root.ts` (already noted) and `setup-mcp.ts` host-service ownership; plus one logical-contract risk with the pre-existing `skill` router.**

### 7d. Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| §1.1 MCP v2 = stateless per-request proxy, native + `mcp__{slug}__{tool}` re-expose, per-source isolation | **High** | proxy-tools.ts + server.ts + route.ts read directly; all symbols/lines confirmed |
| §1.1 downstream sources = org-configured external backends, credential-isolated, SSRF-guarded | **High** | agent.ts schema + agent-source-pool.ts (validate/decrypt/header-inject) confirmed; minor wording fix on `localhost` set |
| §1.2 full native-tool list | **High** | REGISTRARS (register.ts:37-67) is exhaustive and matches the table; tool names verified |
| §1.3 "no local per-user MCP process; consumed as remote HTTP" CONCLUSION | **High** | index.ts/setup-mcp.ts confirm remote http endpoint + skills/subagents-only preinstall |
| §1.3 "Rox preinstalled tool shim at preinstall-catalog.ts:279" SUB-CLAIM | **Refuted (Low)** | no such shim string/line in the file |
| §1.3 "seeded `rox` endpoint is v1, not v2 — convergence gap" | **High** | setup-mcp.ts:85 = `api.zed.md/mcp` (v1); no client points at `/api/v2/agent` |
| §1.5 use cases | **High (interpretive)** | follows directly from verified architecture |
| §1.6 "no skill libraries / no dashboard / teams exist" gap analysis | **High** | schema grep for `skillLibrar`/`dashboard` empty; teams/team_members/activeTeamId confirmed |
| §2.2 proposed ERD (skill_libraries / dashboards) | **Medium** | sound and follows existing denormalized-org-id + knowledge-doc-reuse conventions; unbuilt, hand-off to WS-O; uniqueness/cascade rules reasonable but unverified against migrations |
| §2.3/§3 router pattern ("agentSource.ts: protectedProcedure + requireActiveOrgMembership") | **Low (wrong reference)** | agentSource.ts uses `verifyOrgMembership` + explicit org input; the `requireActiveOrgMembership` pattern is the `skill`/`journal`/`memory` routers — pick and re-cite |
| §3 T6 `mcpAdmin.proxyStatus` via live `connectAll` | **Medium-Low** | technically works but dials all sources per call (cost + SSRF surface); design should prefer cached health |
| §4 file ownership / merge isolation | **High** | no schema files authored by WS-J; only `root.ts` + `setup-mcp.ts` shared, both flagged |
