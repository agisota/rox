# Instant Local-First Project/Workspace Create + Background Cloud Sync

Date: 2026-06-24
Status: Phase 1 (this document is the implemented contract)
Owner: host-service / project-create path
Blast radius: HIGH — changes the core project/workspace create path. Everything new is behind the `localFirstCreate` flag; flag OFF = byte-for-byte today's behavior.

## 1. Problem (verified in code)

`packages/host-service/src/trpc/router/project/handlers.ts` `persistFromResolved` (lines ~114-191) runs the create as a single synchronous saga whose commit unit spans the network:

1. Local file ops (clone / mkdir / git init / first commit) — done by the caller (`createFromEmpty` / `createFromTemplate` / `createFromClone` / `createFromImportLocal`), using the remoteless primitives in `utils/resolve-repo.ts` (`initEmptyRepo`, `cloneTemplateInto`, `initLocalRepoInPlace`) which already auto-fill a fallback git identity (`FALLBACK_COMMIT_IDENTITY_ARGS`, resolve-repo.ts:81).
2. Local DB project row — `persistLocalProject` (utils/persist-project.ts), client-supplied UUID.
3. **MANDATORY** cloud `ctx.api.v2Project.create` via `createCloudProjectWithSlugRetry` (handlers.ts:68-101).
4. **MANDATORY** cloud `ctx.api.v2Workspace.create` + local workspace row via `ensureMainWorkspaceStrict` (utils/ensure-main-workspace.ts:58-108), which ALSO calls `ctx.api.host.ensure`.

On any cloud failure in step 3/4 the `catch` (handlers.ts:155-190) **rolls everything back**: `v2Project.delete` in the cloud, `db.delete(projects)` locally, and `rmSync(repoPath)` on disk (when `cleanupRepoPathOnFailure`). So a flaky network or offline laptop **destroys the user's freshly-created local project and its files**.

Additional hard blocks:
- `ensureMainWorkspaceStrict` throws `PRECONDITION_FAILED` on detached HEAD (ensure-main-workspace.ts:65-71) — a local-only concern that should never gate create.
- The projects root is hardcoded `~/rox/projects` in the renderer (`onboarding/project/page.tsx:42`, `new-project/page.tsx:60`, `NewProjectModal.tsx:74`) and the demo seed (`runtime/seed/demo-project.ts:49`). There is no host setting for it, unlike worktrees which already have `worktreeBaseDir` (`settings/worktree-location.ts`).

## 2. Goals

- **Instant create**: folder + git init + first commit + a LOCAL DB record with a stable LOCAL id, return success, open the workspace — fully synchronous, ZERO network.
- **Durable background sync**: the cloud project + main workspace creates are enqueued into a local outbox table and drained by a worker when the cloud is reachable; the returned cloud id is written back onto the local row. Retries with backoff. Cloud failure is non-fatal.
- **Configurable projects folder** (`projectsBaseDir`) mirroring `worktreeBaseDir`, defaulting to `~/rox`, threaded into the create `parentDir`.
- **Auto-init git** on every create path, controlled by an `autoInitGit` setting (default true).
- **Safety**: all of the above is behind `localFirstCreate`. When OFF, `persistFromResolved` + `ensureMainWorkspaceStrict` behave exactly as today (synchronous cloud + rollback). Existing create tests must still pass.

Non-goals (NOT Phase 1): git bundling, role→model routing, onboarding screen redesign. Existing onboarding keeps working (it just reads `projectsBaseDir`).

## 3. Where the flag + settings live (and why)

`localFirstCreate`, `projectsBaseDir`, and `autoInitGit` are **host settings** (new columns on the single-row `host_settings` table), NOT entries in `packages/shared/src/experimental-features`.

Rationale: the `experimental-features` registry is a **user-facing UI toggle** system (`defaultEnabled: true`, surfaced in "Settings > Experiments", resolved in the renderer via `useExperimentalFeature`). `localFirstCreate` is a **backend create-path safety switch** read synchronously inside host-service with no renderer round-trip — exactly the shape of `worktreeBaseDir` / `branchPrefixMode`, which already live in `host_settings` and are seeded by `ensureHostSettingsRow` (settings/host-settings.ts:38). Putting it there gives us a single seam, a safe default the maintainer can flip, and a value host-service can read on the create call without asking the client.

### Flag default (`flagDefault`)

`localFirstCreate` defaults to **OFF** (`false`) on a fresh `host_settings` row. The new code path is fully built, migration-backed, and tested, but the SAFE default keeps production on today's proven synchronous-cloud-with-rollback path until the maintainer flips it. The desktop coordinator can opt a dev build in by writing the row (or via the `settings.localFirstCreate.set` mutation). This is the conservative choice for a HIGH-blast-radius core path: no behavior change ships enabled-by-default; the maintainer flips one host setting to roll it out.

`projectsBaseDir` defaults to `null` → resolves to `~/rox` at read time (same null-means-default pattern as `worktreeBaseDir`). `autoInitGit` defaults to `true` (the empty/template/import-in-place primitives already init git; this setting only exists to let a maintainer disable it).

## 4. Design

### 4.1 Saga split (handlers.ts)

`persistFromResolved` gets a branch on `getHostLocalFirstCreate(ctx)`:

```
persistFromResolved(ctx, args)
├─ localFirstCreate OFF  → persistSynchronousCloud(...)   # IDENTICAL to today: steps 1-4 + rollback
└─ localFirstCreate ON   → persistLocalFirst(...)
                            1. applyWorkspaceStarterPresets (unchanged)
                            2. persistLocalProject (local row, syncState='pending')
                            3. ensureMainWorkspaceLocal (local workspace row only, no cloud)
                            4. enqueue OUTBOX rows: {kind:'project.create', ...}, {kind:'workspace.create', ...}
                            5. return {projectId, repoPath, mainWorkspaceId}  # NO network, NO rollback
```

The OFF branch is the existing function body verbatim (extracted unchanged) so the diff is provably behavior-preserving. The ON branch never makes a cloud call and never rolls back on cloud failure — only genuine LOCAL failures (disk/db) propagate, and those are real errors the user must see.

`ensureMainWorkspaceLocal` is a new local-only helper next to `ensureMainWorkspaceStrict`: it resolves the branch (relaxed: detached HEAD → synthesize a stable local branch label instead of throwing), writes the local `workspaces` row with a LOCAL workspace id (`randomUUID`), and returns `{id}`. No `host.ensure`, no `v2Workspace.create`.

### 4.2 Local↔cloud id mapping (schema)

New nullable columns, generated via a drizzle migration (NEVER hand-edited):

- `projects.cloudId text` — cloud `v2Project` id once synced (NULL until then).
- `projects.syncState text NOT NULL DEFAULT 'pending'` — `pending` | `synced` | `error`.
- `workspaces.cloudId text`
- `workspaces.syncState text NOT NULL DEFAULT 'pending'`

The UI + all downstream ops continue to key on the LOCAL `id` (unchanged). `cloudId` is purely the link the worker fills in; cloud-only features read `cloudId` and wait-for-sync or degrade.

Important: in the local-first path the local project id is a fresh `randomUUID`; the worker passes that SAME id to `v2Project.create` (which accepts a client-supplied `id`, handlers.ts:78-84) so the cloud row shares the local id — `cloudId === id` on success. We still store `cloudId` explicitly so `syncState` has an unambiguous "the cloud acked this exact id" signal and so a future server-assigned-id model doesn't require a schema change.

### 4.3 Outbox table + worker

New table (migration-generated):

```
sync_outbox(
  id          text primary key,        # randomUUID
  kind        text not null,           # 'project.create' | 'workspace.create'
  dedupKey    text not null,           # idempotency key, unique index
  payloadJson text not null,           # serialized create args
  attempts    integer not null default 0,
  lastError   text,
  createdAt   integer not null,        # Date.now()
  nextAttemptAt integer not null default 0  # backoff gate
)
```

`dedupKey` has a UNIQUE index, so enqueue is `onConflictDoNothing` — re-running create or re-enqueueing the same logical op never produces two rows. Keys:
- project: `project.create:<localProjectId>`
- workspace: `workspace.create:<localWorkspaceId>`

**Idempotency on drain** is layered:
1. The row is keyed by the LOCAL entity id; before issuing the cloud call the worker re-reads the local row and SKIPS if `syncState==='synced'` (already linked).
2. `v2Project.create` is called with the local id; the existing slug-retry (`createCloudProjectWithSlugRetry`) already tolerates slug collisions, and calling create with an id the cloud already has is treated as success (the worker maps a cloud "already exists" for the same id to synced rather than a double-create).
3. The dedup key guarantees a retry after a crash mid-drain re-processes the SAME row, not a duplicate.

Worker shape mirrors `PullRequestRuntimeManager` (start/stop, app.ts:110-117) + `runMainWorkspaceSweep` (periodic reconcile, runtime/main-workspace-sweep.ts):

```
class OutboxSyncManager {
  start()  // setInterval(drain, intervalMs); also drains immediately
  stop()   // clearInterval + abort in-flight
  async drainOnce()  // select pending rows where nextAttemptAt<=now, process each
}
```

Processing one row:
- `project.create`: call `createCloudProjectWithSlugRetry(ctx, {id, name, repoCloneUrl})`; on success set `projects.cloudId=id, syncState='synced'` and delete the outbox row. The dependent `workspace.create` row stays gated until the project row is synced (worker processes project rows before workspace rows, and a workspace row whose project isn't synced yet is deferred via `nextAttemptAt`).
- `workspace.create`: ensure project synced; call `host.ensure` + `v2Workspace.create` with the stored branch/local-workspace-id linkage; on success set `workspaces.cloudId, syncState='synced'` and delete the row.
- On failure: `attempts++`, store `lastError`, set `nextAttemptAt = now + backoff(attempts)` (capped exponential), set the entity `syncState='error'` (transient; flips back to `pending`→`synced` on the next successful drain). Never throws out of the worker; logged like the existing fire-and-forget runtimes.

Connectivity: the interval IS the connectivity probe (a failed cloud call just reschedules). No separate online/offline event is required for Phase 1; the worker also runs an immediate drain on start so a reachable cloud links fast.

### 4.4 projectsBaseDir setting

New `settings/projects-location.ts` mirroring `settings/worktree-location.ts`:
- `getHostProjectsBaseDir(ctx)` → `host_settings.projectsBaseDir ?? null` (null resolves to default `~/rox` at the call site via a `defaultProjectsRoot()` helper in `workspace-creation/shared/worktree-paths.ts`, alongside `defaultWorktreesRoot`).
- `projectsLocationRouter` ({ get, set }) registered in `settings/index.ts`. `set` normalizes via the existing `normalizeWorktreeBaseDir` (absolute / `~`-relative).
- Threaded into create: the create mutation resolves `parentDir` from `getHostProjectsBaseDir` when the caller didn't pass one, replacing the renderer's hardcoded `~/rox/projects`. The renderer hardcode stays as a harmless fallback for now (onboarding keeps working) but the host is the source of truth.

### 4.5 autoInitGit setting

New `host_settings.autoInitGit integer (boolean) DEFAULT true`. `getHostAutoInitGit(ctx)` returns it. The empty/template/import-in-place paths already init git unconditionally; `autoInitGit=false` makes the local-first path skip the in-place `git init` for an import that isn't a repo (it then requires the folder to already be a git repo). Default true = today's behavior.

## 5. Tests (real, host-service)

Using the existing `bun:sqlite` + `:memory:` + `migrate(drizzle)` harness (see settings/host-settings.test.ts):

- (a) **offline create**: flag ON, cloud client throws on every call → local project row exists with `syncState='pending'`, a local main workspace row exists, two `sync_outbox` rows are pending, NO throw, NO rollback (repo dir + db row survive).
- (b) **sync drain**: flag ON, enqueue, then a reachable mock cloud → `drainOnce()` links `cloudId`, sets `syncState='synced'`, deletes the outbox rows.
- (c) **idempotency**: enqueue the same logical op twice → one outbox row (dedupKey conflict); draining twice (or re-draining after a simulated partial) calls `v2Project.create` once and never double-creates.
- (d) **projectsBaseDir threading**: `getHostProjectsBaseDir` default resolves to `~/rox`; setting it changes the resolved `parentDir`.
- (e) **auto-init**: the empty/local-first path produces a valid git repo (HEAD resolves, one commit).
- (f) **REGRESSION (flag OFF)**: flag OFF, cloud `v2Project.create` throws → the existing rollback fires (local row deleted, repo rmSync'd) exactly as today; a successful flag-OFF create still calls the cloud synchronously and returns the cloud-linked ids. Existing create/resolve-repo tests still pass unchanged.

## 6. Verification

- `bun run lint` → 0.
- `bunx turbo typecheck --filter=@rox/host-service` (+ `@rox/shared` if touched).
- `bun test --isolate` for the new outbox/create tests + existing host-service create tests.
- Confirm the migration file under `packages/host-service/drizzle/` was drizzle-kit generated (not hand-written).

## 7. Rollback

The flag IS the rollback: set `host_settings.localFirstCreate=false` (or never seed it true) and the create path is byte-for-byte today's. The new columns are additive and nullable; the outbox table is inert when nothing enqueues. No destructive migration.
