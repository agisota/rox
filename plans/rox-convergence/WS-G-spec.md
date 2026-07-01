# WS-G: Mobile Light-up (Tasks / Workspaces) — Spec

## 1. Findings (evidence-grounded)

### 1.1 What "scaffold / cannot ship" means concretely

The mobile app (`apps/mobile`) has a **fully wired shell** (routing, auth, theming, Electric collections, org switching, device presence) but the **content screens are literal placeholder text**. Concretely:

- **Tasks list** — `apps/mobile/screens/(authenticated)/(tasks)/tasks/TasksScreen.tsx:5-30` renders a `ScrollView` whose only content is the string `"Tasks synced via Electric will appear here"` (line 24). `onRefresh` is a no-op stub with `// TODO: refresh task data` (line 10). It does **not** call `useCollections()` or `useLiveQuery`.
- **Task detail** — `apps/mobile/screens/(authenticated)/tasks/[id]/TaskDetailScreen.tsx:8-36` only reads the route param `id` (line 9) and prints `"ID: {id}"` + `"Task content will appear here"` (lines 26-31). No data fetch.
- **Workspaces (home)** — `apps/mobile/screens/(authenticated)/(home)/workspaces/WorkspacesScreen.tsx:13-66` is more advanced (org switcher sheet is real, backed by `useOrganizations`), but the body is `"Workspaces grouped by project will appear here"` (line 51). `onRefresh` is empty (lines 29-32). No project/workspace list.
- **Workspace detail** — `apps/mobile/screens/(authenticated)/workspaces/[id]/WorkspaceDetailScreen.tsx:9-64` renders three empty `Card`s ("Branch Info", "Claude Session", "Terminal") all with `"... will appear here"` text. No data.

So "cannot ship" = **4 placeholder screens** (Tasks list, Task detail, Workspaces list, Workspace detail). Everything around them works.

**What already works (do NOT rebuild):**
- Auth: `apps/mobile/lib/auth/client.ts:11-31` — better-auth with `@better-auth/expo`, `organizationClient`, `customSessionClient`, `expo-secure-store`. `signIn/signOut/useSession` exported.
- Electric/TanStack collections: `apps/mobile/lib/collections/collections.ts` — **fully functional**. Per-org collections (`tasks`, `taskStatuses`, `projects`, `members`, `users`, `invitations`) + global `organizations`, cached by org id (`collectionsCache`, lines 33-160), Electric shape URL from `EXPO_PUBLIC_API_URL/api/electric/v1/shape`, cookie auth via `authClient.getCookie()`, `snakeCamelMapper`. The `tasks` collection already wires write-back: `onUpdate` → `apiClient.task.update.mutate` (lines 64-71) and `onDelete` → `apiClient.task.delete.mutate` (lines 72-76).
- Provider + hook: `CollectionsProvider.tsx:9-40` exposes `useCollections()` (throws if no active org); `useOrganizations.ts:6-41` already uses `useLiveQuery` against `collections.organizations` and supports `switchOrganization`.
- Tab shell: `app/(authenticated)/_layout.tsx` wraps everything in `CollectionsProvider` + `useDevicePresence()` (device registered once via `apiClient`, `hooks/useDevicePresence/useDevicePresence.ts`).

**Conclusion:** the data layer is ready; only the view layer is stubbed. This is a pure UI-wiring workstream — low risk, high leverage.

### 1.2 The "~25 ported UI components" — out of how many total

- Mobile has **32** UI components in `apps/mobile/components/ui/` (verified by `ls | wc -l`): accordion, alert, alert-dialog, aspect-ratio, avatar, badge, button, card, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, icon, input, label, menubar, native-only-animated-view, popover, progress, radio-group, select, separator, skeleton, switch, tabs, text, textarea, toggle, toggle-group, tooltip.
- The shared web/desktop set `@rox/ui` has **56** components in `packages/ui/src/components/ui/` (verified by `ls | wc -l`), plus higher-order pieces (`ai-elements`, `CinematicGradient`, `mesh-gradient`, `overflow-fade`, `QuoteScreen`, `WallpaperLayer`).
- The mobile components are **not** ported from `@rox/ui` (web shadcn/Radix); they are an independent React Native port built on **`@rn-primitives` v1.4.0** (28 `@rn-primitives/*` deps in `apps/mobile/package.json`) + `uniwind` + `nativewind`-style `className`. They are the RN-equivalents of shadcn primitives.
- So coverage is **32 of 56 (~57%)** of the shared UI surface, RN-reimplemented. For Tasks/Workspaces light-up, the needed primitives (`card`, `text`, `badge`, `avatar`, `skeleton`, `separator`, `button`, `icon`, `select`, `dialog`, `input`) **all already exist** — no new primitives required for P0/P1.

### 1.3 Wiring screens to the working collections (the core of this workstream)

The desktop already proves the exact `useLiveQuery` join shape we mirror — `apps/desktop/.../tasks/components/TasksView/hooks/useTasksData/useTasksData.tsx:31-48`:

```ts
useLiveQuery((q) =>
  q.from({ tasks: collections.tasks })
   .innerJoin({ status: collections.taskStatuses }, ({tasks, status}) => eq(tasks.statusId, status.id))
   .leftJoin({ assignee: collections.users }, ({tasks, assignee}) => eq(tasks.assigneeId, assignee.id))
   .select(({tasks, status, assignee}) => ({ ...tasks, status, assignee: assignee ?? null }))
   .where(({tasks}) => isNull(tasks.deletedAt)),
  [collections]);
```

Mobile collections expose the identical names (`tasks`, `taskStatuses`, `users`, `projects`, `organizations`) so this query is **directly portable**. Status grouping uses `status.type` ∈ `"backlog" | "unstarted" | "started" | "completed" | "canceled"` (`packages/db/src/schema/schema.ts:86`).

Schema grounding for fields to render:
- `tasks`: `slug, title, description, statusId, priority, assigneeId, dueDate, labels, branch, prUrl, externalKey, deletedAt, createdAt` (`schema.ts:114-191`). `SelectTask` at `schema.ts:191`.
- `taskStatuses`: `type` (the 5 categories) at `schema.ts:86`; `SelectTaskStatus` at `schema.ts:112`.
- `projects`: `name, slug, repoOwner, repoName, defaultBranch` (`schema.ts:440-465`); `SelectProject` at `schema.ts:465`.
- **Tasks have NO `projectId`** (verified — `project_id` only on `v2_workspaces`/`secrets`/`sandbox_images`, `schema.ts:658-781`). So the Tasks screen groups by **status type**, not project. The Workspaces "grouped by project" copy maps to **projects → v2_workspaces** (`v2Workspaces.projectId`, `schema.ts:651-696`), but `v2_workspaces` is **not** in the mobile collection set today, so P0 Workspaces lists **projects** only; v2_workspaces is a P1 add (see §3).

Write path is already available: `task.update` / `task.delete` / `task.create` / `task.list` exist (`packages/trpc/src/router/task/task.ts:303,402,406,456`), and mobile `apiClient` is the tRPC client (`apps/mobile/lib/trpc/client.ts`).

### 1.4 Remaining path to a shippable mobile app (ordered)

Auth is done. Ordered feature work:
1. **P0** — Tasks list (live, grouped by status) + Task detail (live, with status/assignee/priority/PR/branch fields, swipe-to-complete via existing `onUpdate`).
2. **P0** — Workspaces list (projects, live) + tap-through to project.
3. **P1** — Workspace/project detail showing real **v2_workspaces** rows (requires adding a `v2Workspaces` Electric collection — see Dependencies on WS-A/host model). Branch/PR/host status surfaced; "Claude Session" / "Terminal" cards become read-only status until relay/remote attach lands (WS owning host model).
4. **P1** — Task create + edit (status change, assignee, priority) via `task.create`/`task.update`; pull-to-refresh wired to collection refetch.
5. **P2** — Push notifications (task assigned / PR ready), deep-linking into task/workspace, offline empty/error states polish, the remaining ~24 UI primitives only as features demand them.
6. **Ship gate**: EAS build (`apps/mobile/eas.json` exists), TestFlight/internal track. No store-blocking gaps in auth/data.

## 2. Target design

### 2.1 Data flow (read path)

```
Neon Postgres ──Electric shape──► /api/electric/v1/shape
                                        │ (cookie auth, table+orgId params)
                                        ▼
        lib/collections/collections.ts  (TanStack electricCollectionOptions, per-org cache)
                                        ▼
        CollectionsProvider ──useCollections()──► screens
                                        ▼
   useLiveQuery(q.from(tasks).innerJoin(status).leftJoin(users)...)
                                        ▼
        TasksScreen / TaskDetailScreen / WorkspacesScreen   (RN views)
```

### 2.2 Write path (already plumbed)

```
TaskDetailScreen action (e.g. mark complete)
   └─► collections.tasks.update(id, draft => { draft.statusId = ... })
         └─► onUpdate (collections.ts:64) ─► apiClient.task.update.mutate ─► txid ─► Electric reconciles
```

### 2.3 Tasks grouping (sequence)

```
mount → useTasksData() ──useLiveQuery──► [tasks⋈status⋈assignee]
      → group by status.type (backlog/unstarted/started/completed/canceled)
      → SectionList sections, sorted by compareTasks-equivalent
      → row tap → router.push(`/(tasks)/${task.id}`)
```

## 3. Phase-2 implementation tasks (TDD, exact paths)

> Co-location per `apps/mobile/AGENTS.md`: logic lives in `screens/**`, hooks under the screen's `hooks/`, route files in `app/**` stay thin re-exports.

**T1 — `useTasksData` hook (mobile).**
Create `apps/mobile/screens/(authenticated)/(tasks)/tasks/hooks/useTasksData/useTasksData.ts` (+ `index.ts`). Port the desktop join (`useTasksData.tsx:31-48`) using mobile `useCollections()`. Return `{ data: TaskWithStatus[], allStatuses }` grouped/sorted. Add a `groupByStatus(tasks)` util in `apps/mobile/screens/(authenticated)/(tasks)/tasks/utils/groupByStatus/groupByStatus.ts`.
Test: `groupByStatus.test.ts` — pure function, feed mock `SelectTask & {status}`, assert section order = backlog→unstarted→started→completed→canceled and `deletedAt` filtered.

**T2 — `TaskListItem` component.**
Create `apps/mobile/screens/(authenticated)/(tasks)/tasks/components/TaskListItem/TaskListItem.tsx` (+ index). Renders `title`, `externalKey`/`slug` badge, priority chip, assignee avatar (`users`), status dot. Uses existing `card`, `text`, `badge`, `avatar`, `icon`.
Test: `TaskListItem.test.tsx` — render with a fixture task, assert title + status label present (react-native-testing-library if present; else snapshot).

**T3 — Wire `TasksScreen`.**
Modify `apps/mobile/screens/(authenticated)/(tasks)/tasks/TasksScreen.tsx`. Replace placeholder (lines 21-27) with a `SectionList` of `TaskListItem` from `useTasksData`. Cache-first render per AGENTS rule (render existing `data` even if collection `!isReady`; show `Skeleton` only when empty+not-ready, empty-state when empty+ready). Wire `onRefresh` to the collection's refetch/`utils` (no-op acceptable if Electric streams; keep spinner ≤300ms). Row tap → `router.push("/(tasks)/"+id)`.
Test: integration — mock `useTasksData` returning fixtures, assert sections render and tapping a row calls router.

**T4 — `useTaskDetail` hook + wire `TaskDetailScreen`.**
Create `apps/mobile/screens/(authenticated)/tasks/[id]/hooks/useTaskDetail/useTaskDetail.ts`. `useLiveQuery` selecting one task by `id` joined to status+assignee. Modify `TaskDetailScreen.tsx:13-35` to render real fields (title, description, status, priority, assignee, dueDate, branch, prUrl link, externalUrl). Add a "Mark complete / change status" action calling `collections.tasks.update(...)` (status → first `completed`-type status).
Test: `useTaskDetail.test.ts` — given fixtures, returns the matching task; missing id → null. Cache-first: existing row shown before `isReady`.

**T5 — `useProjectsData` hook + wire `WorkspacesScreen`.**
Create `apps/mobile/screens/(authenticated)/(home)/workspaces/hooks/useProjectsData/useProjectsData.ts` — `useLiveQuery(q.from(projects))` for the active org. Replace `WorkspacesScreen.tsx:48-54` body with a `ProjectCard` list (name, repoOwner/repoName, defaultBranch). Keep existing org switcher untouched.
Create `.../workspaces/components/ProjectCard/ProjectCard.tsx`. Tap → `router.push("/(home)/workspaces/"+project.id)`.
Test: `useProjectsData.test.ts` returns projects for org; `ProjectCard.test.tsx` renders name + repo.

**T6 — Wire `WorkspaceDetailScreen` (project view, P0 subset).**
Modify `apps/mobile/screens/(authenticated)/workspaces/[id]/WorkspaceDetailScreen.tsx`. Replace the three empty cards with: project header (live `projects` row by id) + a "Workspaces" card listing this project's `v2_workspaces` **once that collection exists** (P1 — see T7). For P0, show project repo/branch info from the live project row; keep Claude/Terminal cards behind a "Coming soon" until host model lands.
Test: `WorkspaceDetailScreen` integration with mocked project fixture.

**T7 (P1) — Add `v2Workspaces` collection.**
Modify `apps/mobile/lib/collections/collections.ts`: add `v2Workspaces` to `OrgCollections` + `createOrgCollections` (shape `params: { table: "v2_workspaces", organizationId }`, `getKey: i => i.id`), mirroring the existing read-only collections (lines 79-160). Then `WorkspaceDetailScreen` lists real workspaces per project (`v2Workspaces.projectId === id`).
Test: `collections.test.ts` (new) — `getCollections(orgId)` returns a `v2Workspaces` collection with id `v2_workspaces-<org>`.

**T8 (P1) — Task create/edit.**
Add `apps/mobile/screens/(authenticated)/(tasks)/tasks/components/CreateTaskSheet/` using `apiClient.task.create`. Add status/assignee/priority edit on detail via `task.update`.
Test: hook test asserting mutate called with correct payload (mock `apiClient`).

## 4. File ownership (Phase-2 merge isolation)

**Owns / may modify (exclusive):**
- `apps/mobile/screens/(authenticated)/(tasks)/**` (TasksScreen, hooks, components, utils)
- `apps/mobile/screens/(authenticated)/tasks/[id]/**` (TaskDetailScreen + hooks)
- `apps/mobile/screens/(authenticated)/(home)/workspaces/**` (WorkspacesScreen body, ProjectCard, hooks) — **except** existing `components/OrganizationHeaderButton/**` and `components/OrganizationSwitcherSheet/**` (leave as-is; read-only dependency)
- `apps/mobile/screens/(authenticated)/workspaces/[id]/**` (WorkspaceDetailScreen + hooks)

**Modifies (shared — coordinate, append-only edits):**
- `apps/mobile/lib/collections/collections.ts` — **only** to add the `v2Workspaces` collection (T7). Additive; do not touch existing collection definitions.

**Must NOT touch (other workstreams / stable):**
- `apps/mobile/lib/auth/**`, `apps/mobile/lib/trpc/**`, `apps/mobile/app/**` route layouts (except thin re-export already present), `apps/mobile/components/ui/**` (no new primitives needed for P0/P1), `apps/mobile/hooks/useDevicePresence/**`, `packages/db/**`, `packages/trpc/**`, all of `apps/web` and `apps/desktop` (read-only reference only).

## 5. Dependencies + wave

- **Independent for P0** (T1–T6): relies only on the already-working collections — no other workstream blocks it. → **Wave P0.**
- **T7 / T8 (P1):** adding `v2Workspaces` collection and surfacing host/workspace state coordinates with the **host-model workstream (hybrid host / v2_hosts + relay)** and the **Turso cross-host agent-state** workstream — mobile only *reads* `v2_workspaces`; do not own host/relay logic. The Claude-session/terminal cards stay "coming soon" until those land. → **Wave P1.**
- Coordinate the single shared file `apps/mobile/lib/collections/collections.ts` with any workstream that also extends mobile collections; keep edits additive to avoid merge conflicts.
- **No DB schema changes** required by this workstream (all tables/columns exist).

## 6. Target PR

- Branch: `ws-g/mobile-tasks-workspaces-lightup`
- PR title: `feat(mobile): light up Tasks and Workspaces screens on live Electric collections`

### 7. Hardening review

Read-only verification pass against actual code (2026-06-20). The spec is **substantially accurate**; core architectural claims all hold. Issues below are mostly minor line-number drift plus two real factual corrections.

#### (a) Factual corrections (file:line)

1. **`@rn-primitives` dep count is 24, not 28** (§1.2 line 28). `apps/mobile/package.json` has exactly **24** unique `@rn-primitives/*` packages (verified `grep -o '@rn-primitives/[a-z-]*' | sort -u | wc -l`). The 24: accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, popover, portal, progress, radio-group, select, separator, slot, switch, tabs, toggle, toggle-group, tooltip. The "28" figure is wrong. Does not change the conclusion (all P0/P1 primitives exist).

2. **`@rox/ui` is 55 components, not 56** (§1.2 line 27). `ls packages/ui/src/components/ui/ | wc -l` = 56, but one entry is `alert-dialog.test.ts` (a test, not a component). Real component count = **55**. So mobile coverage is **32 of 55 (~58%)**, not "32 of 56 (~57%)". Also note 2 of the 32 mobile components (`native-only-animated-view`, `text`) have no `@rox/ui` counterpart, so the true "shared-surface overlap" is 30/55 — the spec's framing of "RN-reimplemented coverage" is directionally right but the exact ratio is loose.

3. **`projects` table starts at schema.ts:435, not 440** (§1.3 line 50). `export const projects = pgTable` is at line **435** (`SelectProject` at 465 is correct).

4. **`collections.ts` line-number drift** (§1.1 line 18, §3 T7 line 129, §2.2 line 87): `collectionsCache` Map is line **30** (spec says 33); `onUpdate` is **63-70** (spec says "collections.ts:64"/"64-71"); `onDelete` is **71-76** (spec says 72-76); read-only collections span **79-142** (spec says "79-160", which actually runs to the cache+getter). All off by ~1-3 lines; the described behavior is correct.

5. **`task.ts` line numbers are EXACT** (§1.3 line 53): `list:303`, `create:402`, `update:406`, `delete:456` all verified — no correction needed.

6. **Desktop join reference is EXACT** (§1.3 lines 33-43): `useTasksData.tsx:31-48` matches the quoted `from/innerJoin/leftJoin/select/where` shape verbatim, including `isNull(tasks.deletedAt)`. `TaskWithStatus` type is at lines 10-13. The sort util is imported from `../../utils/sorting` as `compareTasks` (the spec's "compareTasks-equivalent" phrasing is accurate).

7. **Legacy `workspaces` table also has `project_id`** (§1.3 line 51). Spec lists `project_id` on "v2_workspaces/secrets/sandbox_images" but there is ALSO a legacy `workspaces` table (schema.ts:758-781) with `projectId`. WS-G correctly targets `v2Workspaces` (schema.ts:651), so this is not a wiring error — but the parenthetical inventory is incomplete. Confirm `v2_workspaces` (not legacy `workspaces`) is the intended Electric shape for T7.

8. **All 4 placeholder screens verified verbatim** (§1.1): `TasksScreen.tsx` (no-op `onRefresh`, "Tasks synced via Electric will appear here"), `TaskDetailScreen.tsx` (renders `ID: {id}` + "Task content will appear here"), `WorkspacesScreen.tsx` (real org switcher + empty body), `WorkspaceDetailScreen.tsx` (3 empty Cards: Branch Info / Claude Session / Terminal). Auth client (`lib/auth/client.ts`) verified — also exports `signUp` (spec omits it; harmless).

#### (b) Brief questions not fully answered

- **"~25 ported UI components"** (the brief's literal phrase): the spec answers "32", but never reconciles with the brief's "~25". Likely the brief was approximate and 32 is the real number — but the spec should state explicitly that the brief's "~25" is superseded by the verified 32. Out of: **32 of 55** real `@rox/ui` components (~58%).
- **`onRefresh` semantics**: §3 T3 says "no-op acceptable if Electric streams". TanStack Electric collections do stream, but the spec does not confirm whether a manual `collection.utils.refetch()` / `.refresh()` API exists on the mobile collection objects. Unverified — flag as an implementation-time check, not a blocker.
- **`react-native-testing-library` presence** (§3 T2 line 109 hedges "if present; else snapshot"): not verified in this pass. Test strategy for component tests (T2, T5, T6) is therefore conditional/unresolved.
- **Pull-to-refresh on Workspaces**: §1.4 P1 mentions it but no task wires it for `WorkspacesScreen` specifically (T3 covers Tasks only).

#### (c) Merge-safety check — file ownership vs. siblings

Verified against actual sibling specs present: **WS-A … WS-K** (WS-L/M/N/O do **not** exist in `plans/rox-convergence/` despite the harness brief listing them — treat that list as aspirational).

- **Only WS-H references `apps/mobile`** (`grep -ln "apps/mobile"` across all siblings). WS-H owns **`apps/docs/content/docs/** only`** and references `apps/mobile/**` + `lib/collections` purely as **documentation source material** (read-only). **No write overlap.**
- **`collections.ts` / `lib/collections`**: mentioned in siblings only by WS-H (as doc source). WS-G's additive-only edit (T7, add `v2Workspaces`) has **no competing writer**. Clean.
- **`economy.ts`**: appears in WS-E/F/H/I specs; WS-G touches **no schema and no economy.ts**. The harness rule (schema = WS-O except economy.ts = WS-E) is **not applicable** to WS-G — zero schema surface. No conflict.
- **`packages/db`, `packages/trpc`, `apps/web`, `apps/desktop`**: WS-G lists these as read-only/must-not-touch; consistent with siblings. No overlap.

**Merge-overlap risks: NONE.** WS-G's exclusive ownership (`apps/mobile/screens/(authenticated)/(tasks)/**`, `tasks/[id]/**`, `(home)/workspaces/**` minus the OrganizationHeader/Switcher dirs, `workspaces/[id]/**`) does not intersect any sibling's write set.

#### (d) Confidence rating per major claim

| Claim | Confidence | Basis |
|---|---|---|
| 4 screens are placeholders / data layer ready | **Very High** | All 4 screens + collections.ts + auth + desktop join read directly |
| Wiring approach (port desktop `useLiveQuery` join) | **Very High** | Desktop reference exact; mobile collection names identical |
| Tasks group by status type (no `projectId`) | **Very High** | tasks table schema.ts:114-191 has no projectId; confirmed |
| Component count 32 / coverage ratio | **Medium** | 32 correct; denominator should be 55 not 56; ratio loosely stated |
| `@rn-primitives` = 28 | **Low (wrong)** | Actual = 24 |
| tRPC write paths exist | **Very High** | Line numbers exact |
| `v2Workspaces` not yet in mobile collections (T7 needed) | **Very High** | `OrgCollections` interface lacks it (collections.ts:21-28) |
| Ordered ship path | **High** | Logical; P1 host-model dependency is real but external |
| Merge isolation | **Very High** | Only WS-H references mobile, read-only |
