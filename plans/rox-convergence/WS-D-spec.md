# WS-D: host-service internals + Turso cross-host agent-state sync — Spec

> READ-ONLY discovery + Phase-2 implementation spec. All claims grounded in `file:line`.
> Workstream owner: host-service / pty-daemon / workspace-fs internals + the LOCKED new use case (Turso embedded-replica for cross-host agent-state coordination).

---

## 1. Findings

### 1.1 `runtime/` composition — lifecycle & seeding

`packages/host-service/src/runtime/` is **not** a single subsystem — it is the bag of long-lived "managers" + one-shot bootstrap routines that `createApp()` wires together. The composition root is `app.ts`:

- **Managers (long-lived, db-backed):**
  - `WorkspaceFilesystemManager` (`app.ts:101`) — fs roots per workspace.
  - `GitWatcher` (`app.ts:105-106`) — described in code as *"the single source of truth for `.git/` and worktree fs activity per workspace"*; both `EventBus` and the PR runtime subscribe to it.
  - `PullRequestRuntimeManager` (`app.ts:107-114`) — event-driven branch sync, started with `.start()`.
  - `ChatRuntimeManager` (`app.ts:115-120`) — wraps mastra; injectable for tests.
  - `ChatService` (`app.ts:124`) — *"long-lived singleton wrapping mastra's auth storage"*, per-machine not per-workspace (`app.ts:121-123`).
  - `AgentPreinstaller` (`app.ts:126`).
- **The assembled `runtime` object** (`app.ts:128-134`): `{ auth, chat, filesystem, pullRequests, preinstall }` — this is what is injected into every tRPC context (`app.ts:217`).
- **Bootstrap / seeding (fire-and-forget, idempotent):**
  - `runMainWorkspaceSweep` (`app.ts:165-172`) — *"Backfill `kind='main'` v2 workspaces for projects already set up before this column shipped"*; idempotent, background, tracked so `dispose()` can await it before closing the db.
  - preinstall bootstrap (`app.ts:178-183`) — `mkdir(defaultWorktreesRoot())` then `preinstall.runAuto()`.
  - `runtime/seed/demo-project.ts` — first-launch demo project, *"idempotent: keyed on the on-disk path"* (`demo-project.ts:17-20`).
  - `runtime/sandbox-expiry/scheduleSandboxExpiry.ts`, `runtime/teardown/teardown.ts`, `runtime/setup/config.ts` (reads `~/rox` `config.json` / `config.local.json`, `runtime/setup/config.ts:1-32`).
- **Why structured this way:** lifecycle correctness around the single SQLite handle. `dispose()` (`app.ts:230-272`) shows the intent: a `bootstrapAbort` AbortController stops background writers (`app.ts:164,238`), the sweep is awaited (`app.ts:241`), then each manager `.stop()/.close()` is isolated in its own try/catch (`app.ts:245-264`) *"otherwise a flaky `.stop()` could leak the open SQLite handle for the rest of the process lifetime"*. This is the load-bearing reason the runtime is a hand-wired graph and not a DI container: ordered, abortable teardown around one mutable resource.

### 1.2 `trpc/` layer (~133 files) — template or genuinely different?

**Genuinely different per concern, not a repeated template.** Evidence — the 24 sub-routers composed in `trpc/router/router.ts:27-52` vary by 1–2 orders of magnitude in size:

| Router | Size | Shape |
|---|---|---|
| `health` | 7 lines (`health/index.ts`) | trivial ping |
| `workspace` | 82 | thin |
| `agent-bridge` | 105 | thin |
| `terminal` | 199 | medium |
| `terminal-agents` | 249 | medium |
| `filesystem` | 415 (single file) | fat single-file |
| `settings` | 686 / 6 files | split |
| `agents` | 976 / 4 files | split |
| `project` | 1683 / 9 files | split |
| `git` | 1773 / 9 files | split |
| **`workspaces`** | **1260** (single file) | god-file |
| **`workspace-creation`** | **3586 / 32 files** | the heavyweight; has `procedures/`, `shared/`, `utils/` |

Categorization:
- **Trivial/thin probes:** `health`, `host` (60), `workspace`, `agent-bridge`, `auth` (83).
- **Domain CRUD over host SQLite:** `settings`, `project`, `workspaces`, `pull-requests`, `issues`.
- **Heavy orchestration (subprocess/git/gh):** `workspace-creation` (32 files, `procedures/` + `utils/exec-gh.ts` + `shared/worktree-paths.ts`), `git` (9 files incl. `utils/git-status.ts`, `utils/graphql.ts`), `agents` (agent run capture).
- **Streaming/runtime bridges:** `terminal`, `terminal-agents`, `chat`, `ports`, `filesystem`.

The only shared scaffolding is `trpc/index.ts` (`router`, `protectedProcedure`) and the per-folder `index.ts` re-export (`health/index.ts` is literally `export { healthRouter } from "./health";`). So the *plumbing* is templated; the *procedures* are concern-specific. This matters for Phase 2: file-ownership boundaries can be drawn per sub-router folder with near-zero collision risk.

### 1.3 Why host-service has its OWN SQLite (`src/db`) separate from `@rox/local-db`

Two databases with a deliberate ownership split:

- **host-service db** (`src/db/db.ts` + `src/db/schema.ts`) owns **machine-/repo-truth**: `terminalSessions`, `projects` (repoPath/worktreeBaseDir/branchPrefix), `hostSettings` (single-row `id=1`), `pullRequests`, `hostAgentConfigs`, `agentInstallState`, `workspaces` (worktreePath/branch/headSha). It uses `better-sqlite3` directly (`db.ts:3,13`), WAL + FK pragmas (`db.ts:14-15`), Drizzle `better-sqlite3` migrator (`db.ts:24`).
- **`@rox/local-db`** owns **renderer/UI truth** synced via Electric: `projects` (color/iconUrl), `worktrees`, `workspaces`, `settings` (fonts), `tasks`, `users`, `organizations`, `skills`, `workflowRuns`, etc. (`packages/local-db/src/schema/schema.ts:34-740`). It is consumed by the renderer (`apps/desktop/src/renderer/...`).
- **Confirmed by code comment** (`runtime/seed/demo-project.ts:22-25`): *"project `color`/`iconUrl` live in the renderer's `local-db` projects table, not the host-service db (which owns repo/worktree data)."*

Why two: (a) **runtime constraint** — `app.ts:48-56` notes better-sqlite3 *"isn't loadable under Bun; prod uses it on bundled Node"*, while local-db is the Electric-replicated renderer cache. (b) **trust/ownership boundary** — host-service db is authoritative for on-disk git/worktree state the host process controls; local-db is the org-scoped, Electric-synced projection. (c) **deploy independence** — host-service must run headless without Electron/renderer (`DaemonSupervisor.ts:6-9`), so it cannot depend on the renderer's local-db. This split is the natural seam where Turso (1.6) attaches — a *third* concern (cross-host agent state) that belongs to neither.

### 1.4 `client/core/host` layers (workspace-fs et al.) — what, where from, why "layers"

`packages/workspace-fs` is the canonical example of a **three-layer transport-agnostic service pattern**:

- **`core/`** (`core/service.ts`) — the **interface contract only**: `FsService` with `listDirectory/readFile/writeFile/createDirectory/deletePath/movePath/copyPath/...` plus `FsRequestMap`/`FsSubscriptionMap` type maps. No I/O. This is the shared abstraction both sides agree on.
- **`host/`** (`host/service.ts`) — the **server-side implementation**: `FsHostService extends FsService` (`host/service.ts:16-18`), backed by real fs (`../fs`), `searchContent/searchFiles` (`../search`), and `FsWatcherManager` (`../watch`). Runs where the files are.
- **`client/`** (`client/index.ts`) — the **caller-side proxy**: `createFsClient(transport)` returns an `FsService` whose every method just `transport.request("listDirectory", input)` (`client/index.ts:24-40`). Transport-agnostic (`FsClientTransport` is an interface).

Why presented as layers: it lets the **same `FsService` contract** be satisfied locally (call `host` directly, in desktop main) OR remotely (call `client` over tRPC/WS, from web). This is exactly the seam the HYBRID HOST MODEL needs (locked decision #1): web/mobile bind `createFsClient` to a relay/cloud transport; desktop binds it to the in-process host service. `index.ts` exports `client + core + resource-uri` but **not** `host` (`packages/workspace-fs/src/index.ts`) — host is server-only, imported directly by host-service. The same pattern recurs in host-service's `ports/`, `events/`, and terminal `DaemonClient`.

### 1.5 pty-daemon — session persistence + wire protocol — integrated terminal, or more?

It is **more than the in-app integrated terminal — it is a standalone, crash-survivable PTY-ownership daemon**, and the integrated terminal is one client of it.

- **Wire protocol** (`pty-daemon/src/protocol/messages.ts`): a versioned Unix-socket protocol (v2 framing in `framing.ts`, `version.ts`). Frames carry a JSON header + **binary payload tail** — PTY bytes are *not* base64'd in JSON (`messages.ts:1-5,54,110`). Client→daemon: `hello/open/input/resize/close/list/subscribe/unsubscribe/prepare-upgrade`; daemon→client: `hello-ack/open-ok/output/exit/closed/list-reply/error/upgrade-prepared` (`messages.ts:152-171`).
- **Session persistence is process-level, not disk-level.** `SessionStore` is explicitly *"In-memory map of active sessions. Daemon-local state; nothing is persisted"* (`SessionStore.ts:22-23`). Each session keeps a **~64 KB ring buffer for replay-on-attach** (`SessionStore.ts:4,9,27-29`), capped by bytes with head-eviction (`SessionStore.ts:88-98`); larger scrollback is the renderer's xterm.js job (`SessionStore.ts:29-30`). The `subscribe` message has a `replay` flag (`messages.ts:77-82`) to redraw the screen on re-attach.
- **The "more":** persistence of *shells across host-service restarts* is achieved by the daemon being a **separate process owned by `DaemonSupervisor`** (`daemon/DaemonSupervisor.ts:1-9`): *"PTY ownership lives here so host-service can crash/restart freely without losing user shells."* There is a **live FD handoff / upgrade** path (`prepare-upgrade` → spawn successor → inherit PTY master fds via stdio → `upgrade-prepared`, `messages.ts:89-100,140-148`; `protocol/handoff.ts`) so the daemon binary can be updated without killing shells. The supervisor adopts an existing daemon via the manifest (`daemon/manifest.ts`) or a live socket's `daemonPid` (`messages.ts:38-43`). The 0600 socket perm is the auth boundary (`messages.ts:95-100`).
- **History:** moved out of desktop main on purpose (`DaemonSupervisor.ts:6-9`, plan `apps/desktop/plans/20260430-pty-daemon-host-service-migration.md`) so terminals are deployable headless. **Conclusion:** this is host-grade terminal infrastructure usable by web-attached clients, not just the desktop integrated terminal.

### 1.6 Turso embedded-replica for CROSS-HOST agent-state sync (LOCKED new use case)

**Key finding: the schema already anticipates Turso.** This is not greenfield — there is a reserved `turso` runtime-service kind and per-device plumbing already in the cloud DB:

- `runtime_service_kind` enum includes `"turso", // local-replica sync-engine (per-device)` (`packages/db/src/schema/enums.ts:656`).
- `runtime_services` table has `deviceId` for *"per-device services (turso)"* with a partial unique index `runtime_services_org_kind_device_uniq` on `(org, kind, deviceId)` WHERE `deviceId IS NOT NULL`, commented *"Per-device services (turso, phase 6)"* (`packages/db/src/schema/runtime.ts:215-249`).
- The tRPC `runtime.reportHealth` input already refines `kind === "turso" → requires deviceId` (`packages/trpc/src/router/runtime/schema.ts:232-234`).
- `sync_cursors` table exists for per-device Electric down-sync cursors (`runtime.ts:260-292`).
- `libsql` 0.5.22 is **already a dependency** of `apps/desktop` (`apps/desktop/package.json:196`), fully wired into the native-runtime packaging: materialized + asar-unpacked (`apps/desktop/runtime-dependencies.ts:73-80`), copied per-platform (`apps/desktop/scripts/copy-native-modules.ts:350-393`), and **externalized from the main bundle** with a validator that fails the build if libsql gets bundled (`apps/desktop/scripts/validate-native-runtime.ts:50-89,295-406`). host-service's `build.ts:27` lists `libsql` as external too.

**Is it redundant with Electric? No — they cover orthogonal axes.**

```
                 Electric (existing)              Turso embedded-replica (new, WS-D)
 direction       cloud Postgres -> device         host <-> host, via Turso/libSQL primary
 shape           org-scoped UI/graph projection   ephemeral agent runtime/coordination state
 consumer        renderer local-db (read cache)   host-service agent runtime (read+write)
 write path      app -> cloud Postgres -> Electric writes land in embedded replica, push to primary
 latency model   shape-stream, cursor-resumable   embedded local read (sync()), async push
 source of truth cloud Postgres                    Turso primary DB (per-org agent-state)
```

Electric is **cloud→device read-sync of durable UI state**. It is the wrong tool for *machine-to-machine agent coordination* (e.g. "machine A's agent claimed lock on workspace W"; "agent run R is now on step 3"; "host B should not re-run preinstall X"): that state is (a) high-churn and ephemeral, (b) bidirectionally written by *peers* (host↔host), and (c) does not belong in the renderer's local-db nor in host-service's machine-private SQLite (1.3). An embedded libSQL replica per host gives each host a **local, queryable copy of shared agent state** with local-speed reads and async write-back to a Turso primary — enabling cross-machine coordination that Electric structurally cannot do.

**Genuinely synchronous cross-machine coordination?** Embedded replicas are *eventually consistent* (write local → `sync()` pushes/pulls). So WS-D delivers **fast local reads + async convergence**, NOT distributed locking. For the few operations that need real mutual-exclusion (single-writer claims), route those through the **cloud tRPC `runtime.*` + `runtime_services`/`v2_hosts` registry** (authoritative Postgres, conditional upsert) — the libSQL replica carries the *observable* agent state, the cloud registry arbitrates *claims*. This is the honest design: Turso for cheap convergent shared state, Postgres for the rare strict-serialization decisions.

**What a ready async libSQL TanStack adapter would unlock:** today there is **no `@tanstack/db` / TanStack-DB live-query usage anywhere in the repo** (grep for `useLiveQuery|@tanstack/db|electric-sql` returned zero hits in `apps/web/src` and `packages`). A working async libSQL collection adapter for TanStack DB would let the **web "agents cabinet" and desktop agent panes subscribe to the embedded replica with the same `useLiveQuery` cache-first ergonomics** the AGENTS.md cache-first rule already mandates — i.e. one reactive query layer over *both* Electric (UI state) and Turso (agent state), instead of bespoke polling. Until that adapter is GA, WS-D exposes agent-state through host-service tRPC subscriptions over the EventBus (1.1), and the embedded replica is read via plain libSQL queries on the host side. The adapter is therefore an **enhancer, not a blocker** — design the host API so it can be swapped to a TanStack collection later without renderer churn.

---

## 2. Target design

### 2.1 Where Turso sits (data-flow)

```
   Machine A (desktop host)                Turso primary (per-org)              Machine B (cloud sandbox host)
 ┌───────────────────────────┐          ┌──────────────────────┐          ┌───────────────────────────┐
 │ host-service              │          │  agent_state DB       │          │ host-service              │
 │  ┌─────────────────────┐  │  sync()  │  (libSQL primary,     │  sync()  │  ┌─────────────────────┐  │
 │  │ AgentStateStore     │◄─┼────────► │   org-scoped)         │◄─┼───────►│  │ AgentStateStore     │  │
 │  │  embedded replica   │  │  push/   │                       │  pull/   │  │  embedded replica   │  │
 │  │  (libsql file)      │  │  pull    └──────────────────────┘  push    │  │  (libsql file)      │  │
 │  └─────────┬───────────┘  │                                            │  └─────────┬───────────┘  │
 │            │ local read/write                                          │            │              │
 │  ┌─────────▼───────────┐  │   claims (strict)   ┌──────────────────┐   │  ┌─────────▼───────────┐  │
 │  │ agents/terminal-    │  │ ──────────────────► │ cloud tRPC       │ ◄─┼──│ agents runtime      │  │
 │  │ agents runtime      │  │   runtime.* / hosts │ Postgres (auth)  │   │  └─────────────────────┘  │
 │  └─────────────────────┘  │                     └──────────────────┘   │                           │
 │   EventBus / tRPC sub ──► renderer/web (cache-first useLiveQuery)       │                           │
 └───────────────────────────┘                                            └───────────────────────────┘
```

- `AgentStateStore` is a **new package** `packages/agent-state` (transport-agnostic, `core/host/client` layered like workspace-fs §1.4) wrapping libSQL embedded-replica.
- host-service constructs it in `app.ts` runtime object as `runtime.agentState`, disposed in `dispose()`.
- Local writes go to the embedded replica; a periodic + event-triggered `sync()` converges with the Turso primary.
- Strict claims (single-writer) go through existing cloud `runtime.*` (Postgres), keyed by `deviceId` + `v2Hosts.machineId`.

### 2.2 What it syncs (ERD — new libSQL tables, per-org primary)

```
agent_state_entries                      host_presence
 ─ id           text pk                   ─ device_id     text pk
 ─ org_id       text                      ─ machine_id    text
 ─ device_id    text   (origin host)      ─ host_kind     text  (local|cloud)
 ─ scope        text   (workspace|run|host)─ last_seen_at int
 ─ scope_id     text                      ─ state         text  (online|draining|offline)
 ─ key          text                      ─ updated_at    int
 ─ value_json   text
 ─ revision     int    (lamport-ish)      agent_run_coord
 ─ updated_at   int                        ─ run_id        text pk
 ─ origin_rev   int                        ─ workspace_id  text
   UNIQUE(org_id, scope, scope_id, key)    ─ owner_device  text
                                           ─ step          int
                                           ─ status        text
                                           ─ heartbeat_at  int
```

Synced state = **observable, convergent** agent coordination: per-(workspace/run) agent presence, run progress/heartbeat, "who is doing what", host liveness. NOT synced: secrets, PTY bytes, file contents, durable UI rows (those stay in Electric/local-db/host-db per §1.3).

### 2.3 Conflict model

Last-writer-wins per `(scope, scope_id, key)` using `revision` + `updated_at` (origin device tiebreak). Adequate because entries are owner-scoped (a run's owner host writes its own run row). Cross-owner mutual exclusion is the Postgres-claim escape hatch (§1.6), never LWW.

---

## 3. Phase-2 implementation tasks (TDD, exact paths)

> New package + a thin host-service integration seam. Strictly additive — no edits to existing tRPC sub-routers, terminal, or workspace-fs internals (those are WS-B/WS-C territory).

**T1 — Scaffold `packages/agent-state` (core contract).**
- Create `packages/agent-state/package.json` (`name: @rox/agent-state`, dep `libsql@0.5.22` to match desktop, drizzle), `tsconfig.json`, `src/index.ts`.
- Create `src/core/service.ts`: `AgentStateService` interface — `get(scope,scopeId,key)`, `set(entry)`, `listScope(scope,scopeId)`, `subscribeScope(...)` (AsyncIterable), `reportPresence(...)`, `claim(...)` (delegates, see T6). Mirror the `core/host/client` split of workspace-fs (`packages/workspace-fs/src/core/service.ts:10`).
- Test: `src/core/service.test.ts` — type-level contract + a fake in-memory impl satisfies the interface.
- Expected: compiles, exports contract only, zero I/O.

**T2 — libSQL schema + embedded-replica connector (`host` layer).**
- Create `src/schema.ts` (drizzle sqlite-core): `agentStateEntries`, `hostPresence`, `agentRunCoord` per §2.2 ERD, with the UNIQUE indexes.
- Create `src/host/replica.ts`: `createEmbeddedReplica({ localPath, syncUrl, authToken, syncIntervalMs })` using libSQL `createClient({ url, syncUrl, authToken })`; expose `sync()`, `close()`. Guard for missing `syncUrl` → pure-local mode (offline-first).
- Test: `src/host/replica.test.ts` — open a file-backed local-only client (no syncUrl), write+read an entry, assert WAL/local persistence; mock the sync path.
- Expected: local reads/writes work with or without a configured primary.

**T3 — `AgentStateHostService` implementation (`host` layer).**
- Create `src/host/service.ts`: `AgentStateHostService implements AgentStateService` over the replica + drizzle; LWW upsert keyed on `(org,scope,scope_id,key)` with `revision`/`updated_at`; emit an in-process EventEmitter `"change"` per scope.
- Test: `src/host/service.test.ts` — concurrent `set` with stale revision is rejected/ignored (LWW), `listScope` returns current, `subscribeScope` yields on change.
- Expected: deterministic LWW convergence; subscription fires.

**T4 — `createAgentStateClient` (`client` layer, transport-agnostic).**
- Create `src/client/index.ts`: `createAgentStateClient(transport)` returning `AgentStateService` whose methods call `transport.request/subscribe` — same shape as `createFsClient` (`packages/workspace-fs/src/client/index.ts:24`).
- Test: `src/client/client.test.ts` — fake transport, assert method→request mapping.
- Expected: web/desktop can bind any transport (relay/cloud/in-proc).

**T5 — Periodic + triggered sync loop.**
- Create `src/host/sync-loop.ts`: `startSyncLoop(replica, { intervalMs, signal })` — interval `sync()` + a `kick()` for event-driven push (called on local writes), AbortSignal-cancellable (mirror the abort discipline in `app.ts:164,238`).
- Test: `src/host/sync-loop.test.ts` — fake clock, assert sync cadence, `kick()` coalescing, abort stops the loop.
- Expected: bounded sync traffic, clean teardown.

**T6 — Strict-claim escape hatch via cloud runtime registry (coordination only).**
- Create `src/host/claims.ts`: `requestClaim({ api, orgId, deviceId, scope, scopeId, key })` that calls the existing cloud tRPC `runtime.*` registry (conditional upsert against `runtime_services`/`v2Hosts`) — do NOT implement locking in libSQL. If WS-C/WS-B has not yet exposed a `claim` procedure, gate behind a `ClaimTransport` interface and ship a stub that returns `{ ok:false, reason:"claims-not-wired" }`.
- Test: `src/host/claims.test.ts` — fake claim transport: granted vs. contended.
- Expected: claims are explicitly Postgres-arbitrated, never LWW.

**T7 — host-service integration seam (the ONLY edit to host-service in this WS).**
- Add to `packages/host-service/src/runtime/agent-state/index.ts` (NEW dir) an `AgentStateRuntimeManager` that constructs the host service + sync loop from env (`AGENT_STATE_DB_PATH`, `TURSO_SYNC_URL`, secret key name — value resolved via existing providers, never inlined; cf. `runtime_services.secret_keys` `runtime.ts:223-224`).
- Wire it into the `runtime` object in `app.ts:128-134` as `agentState`, started after `filesystem`, and abort/await/close it in `dispose()` (`app.ts:230-272`) following the existing isolated-try/catch pattern.
- Add env keys to `packages/host-service/src/env.ts` (optional; absence → disabled).
- Test: `packages/host-service/src/runtime/agent-state/agent-state-runtime.test.ts` — manager starts in local-only mode when no `TURSO_SYNC_URL`, dispose is idempotent and closes the libSQL handle.
- Expected: zero behavior change when env unset; opt-in when set.

**T8 — Expose agent-state over tRPC (additive sub-router).**
- Create `packages/host-service/src/trpc/router/agent-state/agent-state.ts` + `index.ts`; register `agentState: agentStateRouter` in `trpc/router/router.ts:27-52` (one-line addition — coordinate ordering with whichever WS also touches `router.ts`).
- Procedures: `getScope`, `setEntry`, `subscribeScope` (over EventBus), `reportPresence`. Read from `ctx.runtime.agentState`.
- Test: `agent-state.test.ts` — round-trip via the router using an injected fake runtime (follow `app.ts` test-injection pattern, `app.ts:47-69`).
- Expected: clients can read/write/subscribe agent state through the host.

**T9 — Migrations + docs.**
- libSQL/drizzle migrations for `packages/agent-state` under that package's own `drizzle/` (NOT `packages/db/drizzle/` — that is Postgres/Electric and off-limits per AGENTS.md). Generate with `drizzle-kit generate` only (offline).
- Add `packages/agent-state/README.md` documenting the Electric-vs-Turso boundary (§1.6 table) and the TanStack-adapter swap point.
- Expected: reproducible schema, documented seam.

---

## 4. File ownership (Phase-2 merge isolation)

**This workstream OWNS (creates/modifies):**
- `packages/agent-state/**` (entire NEW package — exclusive)
- `packages/host-service/src/runtime/agent-state/**` (NEW dir — exclusive)
- `packages/host-service/src/trpc/router/agent-state/**` (NEW dir — exclusive)

**Shared files this WS appends to (coordinate, append-only, single-line):**
- `packages/host-service/src/app.ts` — add `agentState` to the `runtime` object (`app.ts:128-134`) + dispose hook (`app.ts:245-264`). (Touched by WS-B/WS-C too → integrate last or via small, conflict-free hunks.)
- `packages/host-service/src/trpc/router/router.ts` — one import + one router key (`router.ts:27-52`).
- `packages/host-service/src/env.ts` — optional new env keys.
- `packages/host-service/package.json` — add `@rox/agent-state` + `libsql` deps.

**This WS does NOT touch:** `packages/db/**` (Postgres schema/migrations — read-only reference; the `turso` enum/`runtime_services` rows already exist, owned by WS-C), `packages/local-db/**`, `packages/pty-daemon/**`, `packages/workspace-fs/**`, any existing `trpc/router/*` sub-router file other than the one-line `router.ts` registration.

---

## 5. Dependencies + wave

- **Depends on WS-C** (cloud runtime/registry): the `runtime.*` tRPC + `runtime_services`/`v2Hosts`/`sandbox_images` are WS-C's surface. WS-D consumes the existing `turso` kind + `deviceId` plumbing (`enums.ts:656`, `runtime.ts:215-249`, `schema.ts:232`) and needs WS-C's `claim`/host-registry procedure for T6. **Coordinate:** WS-D ships against a `ClaimTransport` interface so it is not blocked if WS-C's claim procedure lands later (stub returns not-wired).
- **Coordinates with WS-B** (host-service tRPC / terminal / web-attach transport): WS-B owns the relay/cloud transport that web binds; WS-D's `client` layer (T4) must satisfy whatever `transport` shape WS-B standardizes. Both append to `app.ts` and `router.ts` → agree on hunk boundaries; WS-D integrates last.
- **Independent of** WS-A/design workstreams.
- **Suggested wave: P1.** P0 should be WS-B/WS-C foundational host-attach + registry; WS-D's cross-host sync is an enhancement that lands once the registry (claims) and transport contract exist. The `@rox/agent-state` package (T1–T6) can be built P0-parallel in isolation (no deps); only the host-service integration (T7–T8) and claims (T6 real path) are P1-gated on WS-C.

---

## 6. Target PR

- **Branch:** `feat/ws-d-agent-state-turso-cross-host`
- **PR title:** `feat(host-service): cross-host agent-state sync via Turso embedded-replica (@rox/agent-state)`

---

## 7. Hardening review

> READ-ONLY verification pass. Spot-checked every `file:line` claim against the working tree (host-service, pty-daemon, workspace-fs, db, trpc). The spec is **substantially accurate** — the architecture narrative holds — but one load-bearing factual claim in §1.6 is **wrong**, several `file:line` citations are off, and a few sub-router sizes undercount. Merge-safety is **clean**.

### (a) Factual corrections (file:line)

1. **WRONG — §1.6 "no `@tanstack/db`/TanStack-DB live-query usage anywhere in the repo".** The parenthetical scopes the grep to `apps/web/src` and `packages` (where it is genuinely 0), but the spec then generalizes to "anywhere in the repo," which is false. `@tanstack/db@0.6.5` + `@tanstack/react-db@0.1.83` are **direct deps of `apps/desktop`** (`apps/desktop/package.json:106,111`) and `useLiveQuery`/TanStack-DB/Electric appears in **92 source files** under `apps/desktop/src/renderer/**` (e.g. `JournalView.tsx`, `MemoryView.tsx`, `useV2UserPreferences.ts`, `api-trpc-react.ts`). Consequence: the conclusion "Until that adapter is GA, WS-D exposes agent-state through host-service tRPC subscriptions" overstates the gap — the cache-first `useLiveQuery` ergonomics the AGENTS.md rule mandates already exist and are pervasive on **desktop**; only **`apps/web`** lacks them. Corrected framing: *a TanStack-DB collection adapter for the embedded libSQL replica already has a consuming surface on desktop; the "enhancer not blocker" conclusion stands, but the missing piece is an async libSQL collection adapter + web adoption, not the absence of TanStack DB entirely.*

2. **Imprecise — §1.5 `SessionStore.ts:22-23` / `:4,9,27-29` / `:88-98`.** File path is `packages/pty-daemon/src/SessionStore/SessionStore.ts` (nested `SessionStore/` dir), not a top-level `SessionStore.ts`. Content claims are otherwise CORRECT: `DEFAULT_BUFFER_BYTES = 64 * 1024` (`SessionStore.ts:4`), the "In-memory map of active sessions. Daemon-local state; nothing is persisted" doc (`SessionStore.ts:22`), and byte-capped head-eviction in `appendOutput` (`SessionStore.ts:~88-98`).

3. **Imprecise path — §1.5 `daemon/DaemonSupervisor.ts:1-9` and `daemon/manifest.ts`.** These live in **`packages/host-service/src/daemon/`**, NOT in `pty-daemon`. The bare `daemon/` prefix is ambiguous given the section is about `pty-daemon`. The "PTY ownership lives here so host-service can crash/restart freely" claim is in host-service's `DaemonSupervisor.ts`. Recommend qualifying as `host-service/src/daemon/DaemonSupervisor.ts`.

4. **Undercounted file counts — §1.2 table & categorization.** Per-file *line* counts are accurate (`filesystem.ts`=415 exact, `workspaces.ts`=1260 exact, `terminal.ts`=199 exact, `health/index.ts` re-export exact). But the "X files" counts exclude tests and undercount real folder size: `workspace-creation` is **42** `.ts` files (spec says 32), `git` **13** (spec says 9), `project` **11** (spec says 9), `settings` **9** (spec says 6), `agents` **6** (spec says 4). The "~133 files" total for `trpc/` is EXACT (verified `find trpc -name '*.ts' | wc -l` = 133). The "24 sub-routers" is EXACT (24 keys in `appRouter`, `router.ts:27-52` verified — `appRouter` literally spans lines 27–52).

5. **CORRECT (verified) — claims worth flagging as solid:** `enums.ts:656` turso enum comment EXACT; `runtime.ts` deviceId at `:219`, partial unique `runtime_services_org_kind_device_uniq` at `:247-249` with "phase 6" comment at `:246` (spec's `:215-249` range is right); `schema.ts` runtime.reportHealth turso→deviceId refine at `:232-233` (spec said `:232-234`, ±1); `libsql 0.5.22` at `apps/desktop/package.json:196` EXACT; `build.ts:27` libsql external EXACT; `db.ts:3` better-sqlite3, WAL+FK pragmas, migrate — all EXACT; workspace-fs `core/host/client` three-layer (`FsHostService extends FsService` at `host/service.ts:16`, `createFsClient` proxy at `client/index.ts:24`, `index.ts` exports client+core+resource-uri NOT host) all EXACT; pty-daemon protocol message set EXACT (`messages.ts` hello/open/input/resize/close/list/subscribe/unsubscribe/prepare-upgrade + replies). The `app.ts` runtime object `{ auth, chat, filesystem, pullRequests, preinstall }` at `:128-134` and dispose isolated-try/catch at `:230-272` are EXACT.

6. **Minor — §1.4 `host/service.ts:16-18`.** `FsHostService extends FsService` opens at line 16 (`export interface FsHostService extends FsService {`); fine.

### (b) Open / under-answered questions

1. **Does `apps/desktop`'s existing `@tanstack/db` already wrap a SQLite/libSQL collection?** The spec assumes the adapter is greenfield, but desktop already ships `@tanstack/react-db`. WS-D should confirm whether desktop's collections are Electric-only or whether a local-SQLite collection pattern already exists to copy, before declaring the libSQL adapter "not GA."

2. **Who owns the Turso *primary* provisioning?** §2.1 shows a "Turso primary (per-org) libSQL DB" but neither §3 tasks nor §5 deps name who stands it up (Turso cloud account, per-org DB creation, auth-token minting). T7 reads `TURSO_SYNC_URL` from env but provisioning is unowned — likely a WS-C registry concern; flag as a dependency gap.

3. **`sync_cursors` reuse.** §1.6 cites `sync_cursors` as Electric down-sync cursors (`runtime.ts:257-295`, verified). The spec mentions it but never says whether Turso sync state reuses this table or needs its own cursor store. Unresolved.

4. **Claim arbitration concretely.** T6 delegates strict claims to "cloud tRPC `runtime.*` (conditional upsert against `runtime_services`/`v2Hosts`)" but no existing `runtime.claim` procedure is cited as present — the spec correctly gates behind a `ClaimTransport` stub, but it remains unverified that WS-C will expose a *conditional* (compare-and-set) upsert vs. a plain upsert. Single-writer correctness hinges on this; should be an explicit WS-C ask.

### (c) Merge-safety check — file ownership vs. all 15 siblings

Verified against WS-A…WS-O ownership sections. **Result: no hard overlaps.**

- **WS-D exclusive NEW dirs** (`packages/agent-state/**`, `host-service/src/runtime/agent-state/**`, `host-service/src/trpc/router/agent-state/**`): grepped all siblings — every other mention of "agent-state"/`agentState` (WS-B:243, WS-C:4, WS-G:153, WS-H:3, WS-J:3) is a **conceptual/coordination reference that explicitly defers to WS-D**, not a competing file claim. ✅ exclusive.
- **`packages/host-service/src/app.ts`** — only **WS-B** also edits it (confirmed: only WS-B and WS-D match `app.ts`). WS-D §5 already flags this and says "integrate last." ✅ managed, append-only.
- **`packages/host-service/src/trpc/router/router.ts`** — only WS-D registers a router key here (no other sibling matches `router/router.ts`). ✅
- **WS-C owns `packages/host-service/src/tunnel/**`** — disjoint from WS-D's `runtime/agent-state` and `trpc/router/agent-state`. ✅
- **WS-L lists `packages/host-service/**`** (WS-L-spec.md:179) — but in its **"READS but MUST NOT modify / frozen"** list, i.e. WS-L *cedes* it. ✅ not a collision.
- **WS-J** touches only `host-service/src/trpc/router/workspace-creation/shared/setup-mcp.ts` — disjoint. ✅
- **WS-E/WS-K/WS-M** reference host-service conceptually but claim no agent-state/app.ts/router.ts paths. ✅
- **Schema:** WS-O is sole owner of `packages/db/src/schema/**` **except `economy.ts`** (WS-O-spec.md:3, verified); **economy.ts = WS-E** (WS-E-spec.md:16). WS-D treats `packages/db/**` as read-only reference (§4) and authors libSQL/drizzle migrations under its **own** `packages/agent-state/drizzle/` (§3 T9) — no Postgres-schema collision. ✅

**Flagged overlaps:** none hard. **One soft coordination point** (already named by the spec): `app.ts` + `router.ts` co-edited with WS-B → keep WS-D's hunks single-line and integrate after WS-B.

### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| §1.1 runtime composition & dispose lifecycle | **High** | `app.ts:101-134,230-272` verified verbatim |
| §1.2 trpc genuinely different per concern (not template) | **High** | 24 routers / 133 files / per-file sizes verified; file-*count* sub-figures undercount (see a4) |
| §1.3 two-SQLite ownership split | **High** | `db.ts`, `schema.ts` tables, demo-project comment all verified |
| §1.4 workspace-fs core/host/client layering | **High** | core interface, `FsHostService extends FsService`, `createFsClient` proxy, index exports all verified |
| §1.5 pty-daemon is crash-survivable daemon, not just integrated terminal | **High** (paths imprecise) | SessionStore + full protocol verified; DaemonSupervisor/manifest live in host-service not pty-daemon |
| §1.6 schema already anticipates Turso (enum/deviceId/index/libsql dep) | **High** | enums.ts:656, runtime.ts:219/247-249, schema.ts:232, package.json:196, build.ts:27 all verified |
| §1.6 Electric vs Turso are orthogonal / Turso = convergent not locking | **Medium-High** | architecturally sound; depends on unverified WS-C conditional-upsert claim path (see b4) |
| §1.6 "no TanStack DB anywhere" → adapter is enhancer | **Low (claim wrong) / Medium (conclusion)** | FALSE for desktop (92 files, deps at package.json:106,111); conclusion survives but premise corrected |
| §2 target design (AgentStateStore, ERD, LWW) | **Medium** | reasonable + consistent with verified plumbing; new code, not yet verifiable |
| §4 file-ownership isolation | **High** | cross-checked all 15 sibling ownership sections; no hard overlap |
