# FN-016 — Mobile workspace Claude session + terminal cards

Status: foundation landed (FN-055). Live data: FN-087. Auth gate: FN-086.
Scope: the per-workspace **Claude Session** and **Terminal** cards on the mobile
workspace-detail screen, plus the shared status model that drives them.

## Goal

On mobile, a workspace detail screen should show, for each workspace, whether its
Claude session and terminal are **live, idle, connecting, ended, errored, or
unavailable** — mirroring what desktop shows in its tab/pane notification dots —
and update in real time as the host pushes changes. The same status vocabulary is
reused by web and desktop so a workspace reads identically on every surface.

## Non-goals (this epic)

- Streaming the actual terminal buffer / Claude transcript to mobile (read-only
  status only; full pane mirroring is a later epic).
- Starting/stopping sessions from mobile (control-plane writes are out of scope;
  cards are observational).

## Shared status model (`@rox/shared/workspace-status`)

Single source of truth, platform-agnostic. Six states:

| status        | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `idle`        | exists, nothing running now (ready to resume)                  |
| `connecting`  | client attaching / first snapshot still streaming              |
| `live`        | actively running (Claude turn in flight, or live pty)          |
| `ended`       | finished cleanly, will not resume                              |
| `error`       | terminated abnormally (non-zero exit / crashed turn)           |
| `unavailable` | cannot be reached (host offline, or no data synced yet)        |

`deriveSurfaceStatus({ lifecycle, hostOnline, isConnecting })` maps a raw row
lifecycle (`starting|running|idle|ended|error`) plus host reachability to a
surface status. Rules that must hold on every platform:

1. `ended` / `error` are **final** — surfaced even if the host later goes offline
   (history reads correctly).
2. An **offline host hides** any `live`/`idle`/`starting` signal -> `unavailable`,
   so a stale `running` row never shows live after the laptop sleeps.
3. `isConnecting` (Electric attaching) wins over `running` -> `connecting`.
4. No row yet, host not known offline -> `unavailable` (still waiting on data).

`highestPriorityStatus(...)` collapses several surfaces into one workspace-level
badge (`live > connecting > error > idle > ended > unavailable`), matching the
desktop notification precedence.

## Data model (FN-087)

Two net-new, org-scoped, Electric-synced tables, modelled on `v2_workspaces`:

```
durable_sessions                         terminals
  id (uuid pk)                             id (uuid pk)
  organization_id -> organizations         organization_id -> organizations
  workspace_id    -> v2_workspaces         workspace_id    -> v2_workspaces
  host_id (text, -> v2_hosts machine_id)   host_id (text,  -> v2_hosts machine_id)
  agent (text, e.g. "claude")              title (text)
  status (durable_session_status enum)     status (terminal_status enum)
  title (text, nullable)                   exit_code (integer, nullable)
  last_active_at (timestamptz, nullable)   last_active_at (timestamptz, nullable)
  created_at / updated_at                  created_at / updated_at
```

Enum values map 1:1 onto `SurfaceLifecycle`:
`starting | running | idle | ended | error`.

Both tables are registered in `apps/electric-proxy/src/table-scopes.ts`
(org-scoped, like `v2_workspaces`) — without this the shape request is rejected.
Mobile, web, and desktop all consume the same shapes.

### Cross-platform reach

- **Core**: schema + status model are platform-neutral (`@rox/db`, `@rox/shared`).
- **Web/desktop**: can add the same two collections + reuse `deriveSurfaceStatus`
  with zero new model code (Electric shapes already proxied).
- **Mobile**: collections added to `apps/mobile/lib/collections/collections.ts`.

## Hooks

`useClaudeSession(workspaceId)` and `useTerminalStatus(workspaceId)`:

- Foundation (FN-055): cache-first live query against the collection, pure
  selector picks the newest row for the workspace, `deriveSurfaceStatus`
  produces the badge status. Selectors are pure (`select*.ts`) and unit-tested
  without Electric. Until the live collections exist the hooks degrade to
  `unavailable`, never throw, never block render.
- Live (FN-087): collections become real Electric collections; the same selector
  + `deriveSurfaceStatus` now reflect host pushes in real time.

Shape of each hook result:

```ts
interface WorkspaceSurface {
  status: WorkspaceSurfaceStatus;
  title: string | null;
  lastActiveAt: Date | null;
  isReady: boolean;
}
```

## UI

`WorkspaceDetailScreen` replaces the two `Coming soon` placeholder cards with a
`SurfaceStatusBadge` (shared colour/label map) fed by the hooks. Reduced-motion
respected (no pulsing when the OS requests it). Empty/host-offline states read
`unavailable` rather than a spinner that never resolves.

## Auth gate (FN-086)

Workspace screens are gated by `useWorkspaceAccess` (derived from `@rox/auth`
session): `signedOut | noOrg | noAccess | ok`. The detail screen renders the
right empty state per case instead of querying collections for an org the user
cannot see. See `useWorkspaceAccess`.

## Verification

- Pure selectors + status model: `bun test` (no network).
- `bunx biome check` + `tsc --noEmit` across `@rox/shared`, `@rox/db`, mobile.
- Migration generated **offline** (`drizzle-kit generate`), not pushed to prod.
