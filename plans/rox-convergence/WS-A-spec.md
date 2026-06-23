# WS-A: Desktop UI Inventory & Screen Decomposition — Spec

> Read-only discovery output for the Rox web↔desktop convergence master plan (HYBRID HOST MODEL).
> Every claim below is grounded in `apps/desktop/src/renderer/**` with file:line evidence.
> This workstream is the **inventory/source-of-truth map** that downstream implementation workstreams consume; in Phase 2 it owns only documentation artifacts (see §4), so it can merge with zero source overlap.

---

## 1. Findings

### 1.0 Two parallel desktop UI generations exist (critical framing for the whole plan)

The desktop renderer ships **two coexisting workspace generations**, gated by PostHog flags. This is the single most important fact for convergence:

- **Legacy ("v1") workspace** — `apps/desktop/src/renderer/screens/main/components/WorkspaceView/**`. Local-host only. Tabs/panes built **directly on `react-mosaic-component`** (`.../ContentView/TabsContent/TabView/index.tsx:1` imports `react-mosaic-component`, `:9` `Mosaic`, `MOSAIC_ID = "rox-mosaic"` at `:29`). Rendered by route `routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx:470` (`<WorkspaceLayout>` imported at `:20`).
- **Hybrid-host ("v2") workspace** — `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/**`. The convergence target. Built on the **generic `@rox/panes` engine** (`packages/panes`), which is host-agnostic (local desktop host OR cloud sandbox host OR relay-attached host). `@rox/panes` consumers are almost entirely under `v2-workspace/**` (grep: `WorkspaceGitStatusProvider`, `openUrlInV2Workspace`, `focusTerminalPane`, `useV2WorkspaceRun`, etc.).

The screens this spec is asked to decompose (Tasks/Pipelines/Automations/Quick Chat/Saved Prompts) and the sidebar/command-palette sit in the **`_dashboard` shell** that wraps BOTH generations, so they are convergence-neutral surfaces that already work host-independently.

### 1.1 External links → system browser: 5 concrete examples

External navigation is deliberately routed to the OS browser (never an in-app Chromium nav) for two reasons: (a) Electron security — the renderer must not navigate the app frame to arbitrary remote origins; (b) UX — docs/PRs/OAuth belong in the user's logged-in default browser. There are two mechanisms: direct `window.open(url, "_blank")` (renderer) and the safer `external.openUrl` tRPC mutation → main-process `shell.openExternal` (scheme-allowlisted).

1. **Docs from Command Palette** — `commandPalette/modules/navigation/commands.tsx:49`: `window.open("https://docs.rox.one", "_blank", "noreferrer")`. Result: "Открыть документацию" command opens docs in the system browser.
2. **PR open after create** — `screens/main/hooks/useCreateOrOpenPR/useCreateOrOpenPR.ts:28` & `:53`: `window.open(result.url, "_blank", "noopener,noreferrer")`. Result: creating/opening a GitHub PR launches the PR page in the system browser.
3. **Browser pane "Open in external browser"** — `screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/components/BrowserToolbar/components/BrowserOverflowMenu/BrowserOverflowMenu.tsx:36,57`: `openExternalMutation = electronTrpc.external.openUrl.useMutation()` then `openExternalMutation.mutate(currentUrl)`. Result: the in-app webview's current URL is handed off to the OS browser via the allowlisted main-process path (`lib/trpc/routers/external/index.ts:115-127`, `shell.openExternal`).
4. **OAuth provider sign-in (Anthropic/OpenAI)** — `components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth/useAnthropicOAuth.ts:94-106` and `.../useOpenAIOAuth/useOpenAIOAuth.ts:68-80`: `openExternalUrl(oauthUrl)`. Result: model-provider OAuth flows open in the system browser so the user authenticates in their real browser session; mirrored at the main-process auth router `lib/trpc/routers/auth/index.ts:100` (`shell.openExternal(connectUrl...)`).
5. **macOS native permission deep-links** — `lib/trpc/routers/permissions/native-permissions.ts:74,82,105,114`: `shellApi.openExternal(PERMISSION_SETTINGS_URLS.fullDiskAccess / accessibility / microphone / appleEvents)`. Result: "Open System Settings" buttons jump directly to the correct macOS privacy pane.

Supporting cast (same pattern, for completeness): Ports docs `screens/main/components/WorkspaceSidebar/PortsList/PortsList.tsx:23`; CLI/skills page `routes/.../_dashboard/cli/page.tsx:29,57,186`; Dashboard help menu `.../DashboardSidebar/.../DashboardSidebarHelpMenu.tsx:34,74,88` (DOCS_URL + REPORT_ISSUE_URL); onboarding `routes/_authenticated/onboarding/page.tsx:62,124` (gh CLI install); integrations `.../settings/integrations/.../IntegrationsSettings.tsx:103` (`${env.NEXT_PUBLIC_WEB_URL}${path}`); config preview `components/ConfigFilePreview/ConfigFilePreview.tsx:32` (`EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS`). URL constants live in `packages/shared/src/constants.ts:18-28` (`COMPANY.GITHUB_URL`, `DOCS_URL`, `REPORT_ISSUE_URL`) and `apps/desktop/src/shared/constants.ts:63-64` (`EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS`).

**Convergence note:** `window.open(_,"_blank")` works in both Electron and web; `electronTrpc.external.openUrl` is desktop-only. Web parity requires a host-agnostic `openExternal` adapter (a target for the host-abstraction workstream, not WS-A).

### 1.2 CommandPalette composition

Entry: `commandPalette/ui/CommandPalette/CommandPalette.tsx`. Structure:
- **Shell**: `Dialog` + `AnimatedDialogContent` (`@rox/ui/motion`) + `cmdk` `Command`/`CommandInput` (`:1`, `:107-136`). A `QueryContext` provider exposes the live query string to frames (`:29-32`, `:137`).
- **Frame stack model**: `useFrameStackStore` (`core/frames`) gives `open/frames/pushFrame/popFrame/reset` (`:35-40`). A command with `children` or `renderFrame` pushes a sub-palette frame instead of executing (`handleSelect` `:59-70`); Backspace on empty query pops a frame (`:77-85`). Two render branches: `SubPaletteView` (inside a frame) vs `CommandListView` (root) (`:138-145`).
- **Command sources (registry, plugin-style)**: `core/registry.ts` is a `Map<id, CommandProvider>` with subscribe/snapshot. Providers are registered in `modules/index.ts:7-13`: `workspaceProvider` (`modules/workspace/commands.tsx`), `actionsProvider` (`modules/actions/commands.tsx`), `openInProvider` (`modules/openIn/commands.ts`), `navigationProvider` (`modules/navigation/commands.tsx`). Active commands are aggregated by `core/useActiveCommands.ts`; context (navigate, current workspace, etc.) supplied by `core/ContextProvider.tsx`; execution by `core/execute.ts`.
- **Sub-frames (UI)**: `ui/SubPaletteView`, `ui/CommandListView`, `ui/RecentlyViewed/RecentlyViewedFrame`, `ui/WorkspaceList/WorkspaceListFrame`, `ui/ThemeFrame`, `ui/LinkTask/LinkTaskFrame`, `ui/QuickOpen`, plus action "mounts" (`DeleteWorkspaceMount`, `RemoveFromSidebarMount`, `SetPreferredOpenInAppMount`). Host wrapper: `commandPalette/CommandPaletteHost.tsx`.
- **Navigation commands** (`modules/navigation/commands.tsx`): Настройки (children = `settingsTabCommands`), Недавно просмотренные (renderFrame), Рабочие области (renderFrame=WorkspaceListFrame), Открыть документацию (`window.open`). Hotkey ids referenced (e.g. `OPEN_SETTINGS`).

**Unique vs shared:** the frame-stack registry architecture is unique to the palette. It pulls from shared sources — `@rox/ui` cmdk/dialog/motion, the hotkeys system (`renderer/hotkeys`), navigation router, workspace data. Note there is also a thin `screens/main/components/CommandPalette/CommandPalette.tsx` (distinct from the `commandPalette/` module) — a wiring shim.

### 1.3 WorkspaceSidebar composition

Entry: `screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx`. Top-to-bottom:
- `SidebarDropZone` wrapper (drag a Git repo folder to add a project) (`:73`).
- `WorkspaceSidebarHeader` (`:74`) → `WorkspaceSidebarHeader/` (incl. `NewWorkspaceButton`).
- Scroll body: maps `groups` → one `ProjectSection` per project (`:81-98`). `ProjectSection/` = `ProjectHeader`, `ProjectThumbnail`, `CloseProjectDialog`, and renders `WorkspaceList` → `WorkspaceListItem`.
- `WorkspaceListItem/` (rich): `WorkspaceIcon`, `WorkspaceStatusBadge`, `WorkspaceDiffStats`, `WorkspaceAheadBehind`, `CollapsedWorkspaceItem`, `WorkspaceContextMenu`, `useWorkspaceDnD`, and `components/` → `WorkspaceHoverCard` (→ `PRStatusBadge`, `ReviewStatus`, `ChecksList`→`CheckItemRow`, `ChecksSummary`), `DeleteWorkspaceDialog`, `RenameBranchDialog`.
- `PortsList` (`:110`, only when expanded) → `WorkspacePortGroup`, `MergedPortBadge`, hooks `usePortsData`/`useKillPort`.
- `SetupScriptCard` (`:112`).
- `WorkspaceSidebarFooter` (`:118`).
- `MultiDragPreview` (`:119`) for multi-select DnD.
- **State**: `useWorkspaceShortcuts()` (`:23`) supplies `groups` (project→workspaces tree, derived data); `useWorkspaceSelectionStore` for multi-select (`:24`); local Escape handler clears selection (`:44-58`). Sidebar reorder/section state via `WorkspaceSection/useSectionMutations.ts`, `utils/reorderProjectChildrenInCache.ts`, `hooks/useSectionDropZone.ts`.

**Unique vs shared:** DnD reordering, hover-card PR/checks aggregation, ports-kill, and the project/workspace tree are sidebar-unique. Shared: `@rox/ui` primitives, the workspace data layer (electron tRPC `workspaces.*`), and `PRIcon`/`normalizePRState` (also used elsewhere). NB: the `_dashboard` shell has a **separate** `DashboardSidebar` (`routes/.../_dashboard/components/DashboardSidebar/**`) — this `WorkspaceSidebar` is the legacy/in-workspace one.

### 1.4 WorkspaceView composition (ContentView / ChangesContent / RightSidebar / layout)

There is no single `WorkspaceView.tsx`; the assembly is the route page + `WorkspaceLayout`.
- **Route page** `routes/.../_dashboard/workspace/$workspaceId/page.tsx` orchestrates init effects (`useWorkspaceFileEventBridge`, `useWorkspaceRenameReconciliation` `:17-18`), shows `WorkspaceInitializingView` while booting, then renders `<WorkspaceLayout>` (`:470`). PR open uses `window.open(pr.url,...)` (`:327`).
- **`WorkspaceLayout`** (`screens/main/components/WorkspaceView/WorkspaceLayout/WorkspaceLayout.tsx`): a two-pane split. Left = `ChangesContent` when `currentMode === SidebarMode.Changes` else `ContentView` (`:39-47`); right = `RightSidebar` inside a `ResizablePanel` when `isSidebarOpen` (`:49-63`). Wrapped in `ScrollProvider`; layout/width/mode from `useSidebarStore`; `useBrowserLifecycle()` manages webview panes.
- **`ContentView`** (`.../ContentView/index.tsx`): `ContentHeader` (with `GroupStrip`), optional `PresetsBar` (gated by `settings.getShowPresetsBar`), and `TabsContent` (`:25-39`). `TabsContent` → `TabView` = the **react-mosaic** grid hosting pane kinds: `BrowserPane`, `ChatPane`, `CommentPane`, `DevToolsPane`, `FileViewerPane`, generic `TabPane` (`TabView/index.tsx:23-28`). Tab/pane state in `renderer/stores/tabs/**`.
- **`ChangesContent`** (`.../ChangesContent/ChangesContent.tsx`): the expanded git-diff reading mode (alternative to tabbed content); exposes `ScrollProvider`/`useScrollContext` consumed by `RightSidebar`.
- **`RightSidebar`** (`.../RightSidebar/index.tsx`): two tabs — **Изменения** (`ChangesView`, only when `worktreePath` exists `:89,222-235`) and **Файлы** (`FilesView` `:244`). Expand/collapse toggles `SidebarMode.Changes`/`Tabs` (`:91-93`); compact tabs when width<250 (`:88`). File-open routes to either pane (`addFileViewerPane`, `:128-144`) or scroll-to-file in expanded mode (`:146-158`). `ChangesView/` is large: `ReviewPanel`, `CommitListVirtualized`, `CommitInput` (PR primary-action logic in `utils/getPrimaryAction`, push copy in `getPushActionCopy`, `auto-create-pr-after-publish`).

**Unique vs shared:** the mosaic pane host + tabs store + git changes/diff/commit/PR machinery are workspace-unique. Shared: `@rox/ui`, hotkeys, electron tRPC (`workspaces.get`, `filesystem.readFile`, `changes.getGitFileContents`).

### 1.5 Per-screen decomposition (Tasks / Pipelines / Automations / Quick Chat / Saved Prompts)

| Screen | Functionality | Key state/vars | Source of each var | Links to | Unique vs shared |
|---|---|---|---|---|---|
| **Tasks** `routes/.../_dashboard/tasks/page.tsx` → `TasksView/TasksView.tsx` | Linear-style task hub: tabs all/active/backlog (`page.tsx:10-18`), type sub-tabs tasks/PRs/issues, board (Kanban) + table views, create-task dialog, run-in-workspace popovers, filters (status/assignee/project), Linear CTA. PR/issue rows open in system browser. | `initialTab/assignee/search/type/project` (route search); `searchQuery`+`deferredSearchQuery`, `viewMode` (board/table) | Route search params via `TasksLayoutRoute.useSearch()` (`page.tsx:10`); persisted UI filters in `stores/tasks-filter-state` (`TasksView.tsx:11-14,50-58`); task rows via **Electric live query** `useCollections()` (`TasksView.tsx:1,10,42`); PR/issue data via tRPC in `PullRequestsContent`/`GitHubIssuesContent` (those use `window.open(url,...)` at `:129`/`:181`) | `/tasks/$taskId` detail, `/tasks/pr/$prNumber`, run-in-workspace → v2-workspace; external GitHub/Linear | Unique: kanban board (`TasksBoardView`, `KanbanCard/Column`), table (`TasksTableView`), task-filter store, RunIn(Issues)InWorkspacePopover, LinearCTA, status/priority/assignee icon system. Shared: status/priority menu items reused across create-dialog + context menu; ProjectThumbnail; `@rox/ui`. |
| **Pipelines** `_dashboard/pipelines/page.tsx` → `PipelinesIndex` (+ `pipelines/$pipelineId` → `PipelineEditor`) | Agent-pipeline list + create-from-template; visual node editor (`PipelineEditor` + `PipelineCanvas`) with node kinds Start/AgentRole/Approval/Response/Loop, RoleLibraryPanel, TriggerConfigPanel, RunMonitorPanel. A pipeline = `workflow_definitions` row `engine="pipeline"`. | `dialogOpen`, `templateId`, `name`; `pipelines` list; `createMutation` | **Cloud tRPC** `useCloudTrpc`/`api-trpc-react` — `trpc.pipeline.list` query + `pipeline.createDraft` mutation (`PipelinesIndex.tsx:20,49-69`); templates from local `../templates` `PIPELINE_TEMPLATES` (`:21`). Explicitly Neon cloud data, **not** Electric (`pipelines/page.tsx:4-9`). | `/pipelines/$pipelineId` editor | Unique: entire node-graph editor + canvas + node components + templates (no reuse elsewhere). Shared: `@rox/ui` dialog/input, cloud tRPC client. |
| **Automations** `_dashboard/automations/page.tsx` (self-contained page; +`automations/$automationId` editor) | Scheduled agent runs. Mine/Команда scope tabs with counts, table (name/owner/project/workspace/host/agent/schedule), enable toggle dot, row menu (edit/run-now/version-history/delete), create-from-template dialog, RRULE schedule description. | `createOpen`, `initialTemplate`, `scope`, `pendingDelete`; `automations`, `userRows`, `recentProjects`, `workspaceRows`, `hostRows`; `currentUserId`; `runNowMutation`/`deleteMutation` | Automations + users + v2Workspaces + **v2Hosts** via **Electric live queries** `useCollections()` (`automations/page.tsx:117-188`); `recentProjects` via `useRecentProjects` hook; `currentUserId` from `authClient.useSession()` (`:81-82`); run/delete via **cloud tRPC** `apiTrpcClient.automation.runNow/delete` (`:92-115`); schedule text via `@rox/shared/rrule` `describeSchedule` (`:451`). | `/automations/$automationId` (+`?history`); docs link `COMPANY.DOCS_URL/automations` (`:268`) | Unique: AgentCell, CellWithIcon, CreateAutomationDialog, templates, useRecentProjects, RRULE rendering. Shared: ProjectThumbnail, `@rox/ui`, CollectionsProvider, host/workspace collections (host data shared with hybrid-host model). |
| **Quick Chat** `_dashboard/quick-chat/page.tsx` → `QuickChatView` | Project-less chat against the Rox house model (or user-key model); model picker + reasoning-level pills; one lazily-created `chat_sessions` row per conversation (so Журнал can summarize). Picks up a staged prompt from Saved Prompts. | `model`, `reasoning`, `input`, `messages[]`, `isSending`, `sessionIdRef`, `scrollRef` | All **local React state** (`QuickChatView.tsx:48-59`); models from `@rox/shared/chat-models` (`:1-6`); completion via **cloud tRPC** `apiClient.chat.complete.mutate` (`:115`); staged prompt via `useQuickChatDraftStore` `consumePrompt` (`:46,62-65`). | Receives from Saved Prompts (`/quick-chat`); session feeds Журнал summaries. | Unique: the whole transient chat surface, reasoning-pill UI, draft-store handshake. Shared: chat-models constants, cloud chat tRPC, `@rox/ui`. NB: distinct from the full agent `Chat/ChatInterface` used in workspace chat panes. |
| **Saved Prompts** `_dashboard/saved-prompts/page.tsx` → `SavedPromptsView` | CRUD library of reusable prompts; create/edit dialog, copy-to-clipboard, "Вставить в чат" → stages prompt + navigates to Quick Chat, delete with toast. | `dialog` (closed/create/edit), `title`, `body`; `prompts`; `createMutation`/`updateMutation`/`deleteMutation` | Prompts via **electron (local) tRPC** `electronTrpc.savedPrompts.list/create/update/delete` (`SavedPromptsView.tsx:32,46,57,66,75`) — i.e. local-db, desktop-only today; clipboard via `useCopyToClipboard`; staging via `useQuickChatDraftStore` `stagePrompt` (`:33,113`). | Pushes prompt to `/quick-chat` (`:114`). | Unique: prompt CRUD list/dialog + quick-chat handshake. Shared: `@rox/ui`, quick-chat-draft store (shared only with Quick Chat). **Convergence gap**: saved prompts live in local-db (`SelectSavedPrompt` from `@rox/local-db`), so web parity needs a host-backed or cloud store. |

### 1.6 Panes layout (`@rox/panes` / react-mosaic)

There are **two distinct layout engines**, and conflating them is the main convergence risk:

- **`@rox/panes`** (`packages/panes`) — a generic, headless workspace layout engine. Model: Workspace→Tabs→Panes; layout is an n-ary weighted split tree (`LayoutNode`) referencing a flat `panes` map by `paneId` (README §"Data Model", `packages/panes/src/types.ts`). Vanilla zustand `StoreApi` via `createWorkspaceStore` (host/persistence-agnostic via `replaceState`/`subscribe` — README §Store). You supply a `PaneRegistry<TData>` mapping pane `kind`→`renderPane/getTitle/getIcon/renderToolbar`; pane content is yours. Hooks: `useOnBeforeClose`, `useContextMenuActions`. DnD via external `react-dnd` `DndProvider` (not bundled). **Purpose:** the host-agnostic substrate enabling identical pane UX across local-desktop, relay-attached, and cloud-sandbox hosts. **Used in:** the **v2-workspace** (`routes/.../_dashboard/v2-workspace/$workspaceId/**` — utils/providers/hooks all reference panes). This is the convergence target engine.
- **react-mosaic-component (direct)** — the **legacy v1** workspace (`screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx`, `MOSAIC_ID="rox-mosaic"`, `mosaic-theme.css`). Pane kinds hard-wired: Browser/Chat/Comment/DevTools/FileViewer/TabPane. Local-host only. Tab state in `renderer/stores/tabs/**`.

**Implication for the master plan:** convergence = migrate/retire the react-mosaic v1 path onto `@rox/panes` so a single host-agnostic pane engine serves desktop + web. WS-A only documents this; the actual migration is a separate (large) workstream.

### 1.7 Maturity / stub honesty

- Tasks/Automations are **Electric-backed and mature** (live queries, cache-first per AGENTS.md rule 9). Pipelines/Quick Chat/Automation-mutations are **cloud-tRPC backed** (Neon), already host-independent on the read/write API.
- **Quick Chat** is intentionally lightweight: messages are local React state only (no persistence of the transcript beyond the `chat_sessions` row id; `messages[]` is in-memory — refresh loses the visible thread). Reasonable for a "transient" surface but a parity gap vs web if web expects durable chat.
- **Saved Prompts** is **desktop-only** (local-db via electron tRPC) — clearest web-parity gap among the five.
- The v1↔v2 duplication (two sidebars: `WorkspaceSidebar` vs `DashboardSidebar`; two pane engines) is real tech debt; flags gate exposure. No screen here is a dead stub, but the legacy mosaic path is the deprecation candidate.

---

## 2. Target design

### 2.1 Current desktop UI map (as-is)

```
RootRoute (__root.tsx)
└─ _authenticated (layout.tsx, AuthProvider/CollectionsProvider/ElectronTRPCProvider)
   ├─ _dashboard (layout.tsx = shell: DashboardSidebar + TopBar)
   │  ├─ tasks            → TasksView    [Electric: tasks; tRPC: PRs/issues]
   │  ├─ pipelines        → PipelinesIndex/PipelineEditor [cloud tRPC: pipeline.*]
   │  ├─ automations      → AutomationsPage [Electric: automations/hosts; cloud tRPC: runNow/delete]
   │  ├─ quick-chat       → QuickChatView  [local state; cloud tRPC: chat.complete]
   │  ├─ saved-prompts    → SavedPromptsView [electron tRPC: savedPrompts.* (local-db)]
   │  ├─ journal / memory / cli / skills-library / workspaces / tasks
   │  ├─ workspace/$id    → WorkspaceLayout  ── v1 ── react-mosaic TabView
   │  │                       ├─ ContentView (ContentHeader+GroupStrip, PresetsBar, TabsContent→TabView)
   │  │                       │     panes: Browser|Chat|Comment|DevTools|FileViewer|TabPane
   │  │                       ├─ ChangesContent (expanded diff mode)
   │  │                       └─ RightSidebar (Изменения=ChangesView | Файлы=FilesView)
   │  └─ v2-workspace/$id  ── v2 ── @rox/panes engine  (HYBRID HOST target)
   ├─ _standalone/new-project
   ├─ onboarding
   └─ settings/* (account, appearance, terminal, agents, models, api-keys, security, ...)

Cross-cutting overlays: CommandPalette (commandPalette/**, frame-stack registry),
WorkspaceSidebar (legacy in-workspace tree) vs DashboardSidebar (shell).
External nav → window.open / electronTrpc.external.openUrl → shell.openExternal.
```

### 2.2 Convergence data-flow (target, for downstream workstreams)

```
                 ┌────────────── host abstraction (other WS) ──────────────┐
 UI screens ───► │ openExternal()  pane-engine(@rox/panes)  chat/prompt API │ ◄─── web + desktop
 (this WS docs)  └──────────┬───────────────┬───────────────────┬──────────┘
                            │               │                    │
                 desktop: shell.openExternal│            cloud tRPC / Electric / Turso-host-sync
                 web:      window.open       react-mosaic→panes   (saved-prompts → host-backed)
```

WS-A's job: produce the authoritative component/state/host-coupling inventory (above) so the host-abstraction, panes-migration, and web-parity workstreams have exact targets and ownership lines.

---

## 3. Phase-2 implementation tasks (WS-A deliverables)

WS-A is a **discovery/spec** workstream. Its Phase-2 output is documentation, not source edits, so it cannot collide with implementation PRs. Each task = a markdown artifact under `plans/rox-convergence/inventory/` with a verification step (a reviewer diff-check against the cited files).

1. **`screen-coupling-matrix.md`** — Author the full per-screen table (extend §1.5) with one row per `_dashboard` screen × columns {data source: Electric|cloud-tRPC|electron-tRPC|local-state, host-coupling: local-only|cloud-ok|host-agnostic, web-parity-gap: yes/no}. *Test:* reviewer spot-checks 5 rows against the named source files; every "data source" cell must cite a file:line. *Expected:* a single matrix the host-abstraction WS uses to prioritize.
2. **`external-link-registry.md`** — Enumerate every external-nav callsite (the §1.1 list + supporting cast) as a table {file:line, mechanism: window.open|external.openUrl|shell.openExternal, URL/const}. *Test:* `grep -rn "openExternal\|window.open\|external.openUrl"` count equals row count. *Expected:* exact target list for the `openExternal` host-adapter WS.
3. **`pane-engine-migration-map.md`** — Map v1 react-mosaic pane kinds (Browser/Chat/Comment/DevTools/FileViewer/TabPane) → their v2 `@rox/panes` equivalents (or "missing"), with the `renderPane/getTitle/getIcon/renderToolbar` contract each needs. *Test:* every v1 pane kind appears with a v2 disposition; cite `TabView/index.tsx` + the v2-workspace registry. *Expected:* the de-dup plan for the panes-migration WS.
4. **`command-palette-provider-inventory.md`** — Document the 4 providers + frame/sub-frame components + command sources, flag which commands are desktop-only (e.g. `external.openUrl`, electron tRPC). *Test:* provider count matches `modules/index.ts`. *Expected:* palette parity checklist for web.
5. **`sidebar-dedup-spec.md`** — Side-by-side `WorkspaceSidebar` (legacy) vs `DashboardSidebar` (shell) component & state inventory, with a recommended single-source-of-truth target. *Test:* both trees enumerated to leaf components with file paths. *Expected:* sidebar unification target.
6. **`web-parity-gaps.md`** — Consolidated ranked list of host-coupled surfaces blocking web parity (Saved Prompts local-db, Quick Chat in-memory transcript, electron-tRPC-only screens, react-mosaic v1). *Test:* each gap cites the coupling file:line from tasks 1–5. *Expected:* the master backlog input for P0/P1/P2 sequencing.

No `.tsx`/source files are created or modified by WS-A.

---

## 4. File ownership (Phase-2, for merge isolation)

WS-A owns ONLY (create-only, no edits to existing source):

```
plans/rox-convergence/WS-A-spec.md                                  (this file)
plans/rox-convergence/inventory/screen-coupling-matrix.md
plans/rox-convergence/inventory/external-link-registry.md
plans/rox-convergence/inventory/pane-engine-migration-map.md
plans/rox-convergence/inventory/command-palette-provider-inventory.md
plans/rox-convergence/inventory/sidebar-dedup-spec.md
plans/rox-convergence/inventory/web-parity-gaps.md
```

WS-A modifies **zero** files under `apps/`, `packages/`, or `tooling/`. All other workstreams may freely edit desktop source; WS-A will not conflict.

---

## 5. Dependencies + suggested wave

- **Wave: P0 (foundational discovery).** WS-A is a pure-read inventory that every implementation workstream depends ON; it must land first (or in parallel-early) so downstream specs reference its matrices.
- **Depended-on by (consumers):** the host-abstraction/`openExternal`-adapter WS (consumes task 2), the panes-migration WS (task 3), the command-palette web-parity WS (task 4), the sidebar-dedup WS (task 5), and the master P0→P1→P2 sequencer (task 6).
- **Depends on:** nothing in this repo (read-only). Coordinates with the master-plan owner to align the inventory column taxonomy with other WS IDs.
- Because output is docs-only, WS-A can run concurrently with any implementation wave without merge risk.

---

## 6. Target PR

- **Branch:** `t/ws-a-desktop-ui-inventory`
- **PR title:** `docs(convergence): WS-A desktop UI inventory & screen decomposition`

---

### 7. Hardening review

Read-only verification pass against the cited code. Method: located each cited file/symbol with Glob/Grep, confirmed line numbers, and cross-checked sibling specs for ownership overlap.

#### (a) Factual corrections (file:line)

1. **Main-process router paths are wrong — they have no `renderer/` segment.** §1.1#4, #5 and §1.0 cite `apps/desktop/src/renderer/lib/trpc/routers/...`, but the actual paths are `apps/desktop/src/lib/trpc/routers/...` (no `renderer/`):
   - external: `apps/desktop/src/lib/trpc/routers/external/index.ts` — `openUrl` mutation at `:115`, `shell.openExternal(input)` at `:127` (line range `115-127` in §1.1#3 is correct; only the path prefix is wrong).
   - native permissions: `apps/desktop/src/lib/trpc/routers/permissions/native-permissions.ts` — `:74,82,105,114` confirmed (path prefix wrong).
   - auth: `apps/desktop/src/lib/trpc/routers/auth/index.ts:100` `shell.openExternal(connectUrl...)` confirmed (path prefix wrong).
   This affects §1.1#3, #4, #5 and the §1.0 line-15 framing where it says "ContentView..." — only the three router paths are mislabeled. **Fix:** drop `renderer/` from all three router paths; the renderer-side hook/component paths (e.g. `useAnthropicOAuth`, `BrowserOverflowMenu`) are correctly under `.../renderer/...`.

2. **native-permissions has a 6th `openExternal` callsite the spec omits.** `native-permissions.ts:122` `shellApi.openExternal(PERMISSION_SETTINGS_URLS.localNetwork)` exists in addition to the four cited (`:74,82,105,114`). §1.1#5 should read "5 deep-links" or add localNetwork. The §3 task-2 `grep` count test will now expect 6 rows from this file, not 5 — worth flagging so the count assertion doesn't fail.

3. **§1.1#4 mischaracterizes the OAuth mirror.** It says model-provider (Anthropic/OpenAI) OAuth is "mirrored at the main-process auth router `auth/index.ts:100`." Verified: the model-picker OAuth hooks do NOT call `shell.openExternal` directly nor the auth router — they call `electronTrpcClient.external.openUrl.mutate(url)` (`useAnthropicOAuth.ts:94-97`, `useOpenAIOAuth.ts:68`). The `auth/index.ts:100` `shell.openExternal(connectUrl)` is a SEPARATE flow: the Rox-cloud provider-connect deep-link (`connectUrl` built `:87-92`), not the model-provider OAuth. **Fix:** these are two distinct external-nav paths; don't present `auth:100` as the "mirror" of the model OAuth. (Both still belong in the external-link registry, task 2.)

4. **§1.1#4 line `:68-80` for `useOpenAIOAuth` is slightly off.** Actual: `openExternalUrl` defined at `:68`, used at `:80` and `:95`. The `94-106`/`68-80` ranges in the spec are approximate but land in the right region; treat as "~". `useAnthropicOAuth` `94-106` is accurate (`openExternalUrl` at `:94`, `openOAuthUrl` calling it at `:106`).

5. **§1.5 Saved Prompts line refs drift.** Spec cites `electronTrpc.savedPrompts.list/create/update/delete` at `:32,46,57,66,75`. Actual: `list` at `:47` (not `:32`/`:46`), `create` `:57`, `update` `:66`, `delete` `:75`. Confirmed `SelectSavedPrompt` from `@rox/local-db` at `:1`, `useQuickChatDraftStore` `stagePrompt` at `:44`. Claim is substantively correct; only the `list` line is wrong.

6. **§1.6 / §1.0 TabView line refs.** `TabView/index.tsx`: `react-mosaic-component` CSS import at `:1`, the named `Mosaic` import at `:6` (block `:6-9`), `MOSAIC_ID = "rox-mosaic"` at `:30` (spec said `:29`). Off-by-one on MOSAIC_ID; "imports react-mosaic-component `:1`" is the CSS line, the value import is `:6`. Minor.

Everything else verified accurate: §1.1#1 (`navigation/commands.tsx:49` `window.open("https://docs.rox.one"...)`) ✓; §1.1#2 (`useCreateOrOpenPR.ts:28,53`) ✓; §1.1#3 (`BrowserOverflowMenu.tsx:36,57`) ✓; constants `packages/shared/src/constants.ts:18,19,28` + `apps/desktop/src/shared/constants.ts:63-64` ✓; §1.2 four providers in `modules/index.ts:2-5,9-12` in stated order ✓; §1.3 WorkspaceSidebar lines `:23,24,73,74,110,112,118,119` ALL exact ✓; §1.4 WorkspaceLayout imports + RightSidebar `worktreePath`/`SidebarMode.Changes`/`addFileViewerPane` (`showChangesTab=!!worktreePath` at `:89`) ✓, `getPrimaryAction.ts`+`getPushActionCopy.ts` exist under `CommitInput/utils/` ✓; §1.5 Tasks (`useCollections()`+`tasks-filter-state`), Pipelines (`useCloudTrpc`/`pipeline.list`/`createDraft`/`PIPELINE_TEMPLATES`), Automations (`useCollections()`+`v2Hosts`+`apiTrpcClient.automation.runNow/delete`+`describeSchedule`+`useRecentProjects`+`authClient.useSession`), Quick Chat (`apiClient.chat.complete.mutate` at `:115`, local `useState` `:48-58`), all verified ✓; `packages/panes/src/{core,react,types.ts,index.ts}` exists ✓; `v2-workspace/$workspaceId/{providers,utils,state,components,hooks}` exists ✓; PipelineEditor sub-components (PipelineCanvas/RoleLibraryPanel/RunMonitorPanel) exist ✓.

#### (b) Open questions (not fully answered by the brief)

1. **OAuth allowlist scope:** `external.openUrl` is scheme-allowlisted via `main/lib/safe-url/`. Does the allowlist permit the macOS `x-apple.systempreferences:` / settings schemes that native-permissions deep-links use, or do those bypass `isSafeExternalUrl` (they call `shellApi.openExternal` directly, not the tRPC `openUrl`)? The two paths have different guards — the registry (task 2) should note guard-per-callsite, not assume all are allowlisted.
2. **Quick Chat session persistence:** §1.7 says one `chat_sessions` row is "lazily created." Where is it written — is it `apiClient.chat.complete` server-side, or a separate mutation? Not traced; the web-parity gap analysis (task 6) needs to know if the row write is host-agnostic.
3. **v2-workspace ↔ screens:** the brief asks how each screen "links to other screens." The spec gives navigation targets but does not confirm whether "run-in-workspace" from Tasks/Automations routes to `v1 workspace/$id` or `v2-workspace/$id`. Given convergence stakes, which generation the deep-links target is load-bearing and unverified here.
4. **`screens/main/components/CommandPalette/CommandPalette.tsx` shim:** §1.2 calls it a "wiring shim" distinct from `commandPalette/`. Its actual role (does it just mount `CommandPaletteHost`?) is asserted, not shown.

#### (c) Merge-safety check (file ownership)

WS-A Phase-2 ownership is **docs-only**: `plans/rox-convergence/WS-A-spec.md` + 6 files under `plans/rox-convergence/inventory/`. §4 asserts zero edits under `apps/`, `packages/`, `tooling/`.

- **Sibling spec scan:** grepped WS-B…WS-O for any reference to `plans/rox-convergence/inventory/` or WS-A paths — **zero hits**. No sibling claims WS-A's doc paths. **No overlap.**
- **Note on the brief's sibling list:** the brief names WS-A…WS-O including **WS-L and WS-N**, but **no `WS-L-spec.md` or `WS-N-spec.md` exists** on disk (present: A,B,C,D,E,F,G,H,I,J,K,M,O). Merge-safety against L/N is therefore moot/non-applicable; flagging in case those were expected to exist.
- **Schema ownership (WS-O except economy.ts=WS-E):** `packages/db/src/schema/economy.ts` confirmed to exist, so the WS-E carve-out is grounded. WS-A touches **no** schema files, so it's orthogonal to the WS-O/WS-E split regardless.
- **Read-vs-write:** WS-A only READS `apps/desktop/**` and `packages/panes/**`. Even where sibling implementation workstreams edit those same source files, WS-A creates no edits there → no write-write conflict possible.

**Verdict: no merge overlaps.** WS-A's create-only doc set is disjoint from every existing sibling spec's ownership.

#### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| External links → system browser (5+ examples) | High | All renderer callsites verified at exact lines; router paths corrected (path-prefix bug, not existence bug); 6th permission deep-link found |
| CommandPalette composition (4 providers, frame-stack) | High | `modules/index.ts` provider list + order verified; registry/core files exist at cited paths |
| WorkspaceSidebar composition | High | Every cited line (`:23,24,73,74,110,112,118,119`) exact |
| WorkspaceView (Layout/ContentView/ChangesContent/RightSidebar) | High | Imports + `worktreePath`/`SidebarMode` gating + CommitInput utils all confirmed |
| Per-screen data sources (Tasks/Pipelines/Automations/QuickChat/SavedPrompts) | High | Each Electric/cloud-tRPC/electron-tRPC/local-state coupling grep-confirmed; only SavedPrompts `list` line drifted |
| Two pane engines (react-mosaic v1 vs @rox/panes v2) | High | `packages/panes/src` + `v2-workspace/**` + `MOSAIC_ID="rox-mosaic"` all exist (MOSAIC_ID off-by-one only) |
| File-ownership merge isolation | High | Zero sibling references to WS-A doc paths; docs-only, read-only on source |
| OAuth "mirror at auth:100" framing | Medium→Low | Verified incorrect: model OAuth uses `external.openUrl`, not the auth-router connect flow (two separate paths) |
| Cross-screen link targets (v1 vs v2 workspace) | Low | Navigation targets stated but generation not verified |
| Quick Chat `chat_sessions` lazy-write location | Low | Asserted, not traced in code |

---

## Addendum — Additive Host WRITE Plane (Option A)

The frozen `@rox/shared/host-client` boundary (`types.ts` + `create-host-client.ts`) is **READ-only**. To let web/mobile/desktop *act* on a host (send chat, write terminal input, launch agents) without touching that frozen contract, WS-A adds a **separate, purely additive** `HostWriteClient` + `createHostWriteClient` factory in a NEW file `packages/shared/src/host-client/host-write-client.ts`, exported append-only from the barrel. The read contract files end with an **empty git diff**.

**Decision (Option A):** keep WRITE in its own client + factory rather than widening `HostClient`. Reads and writes converge at the shared `HostTransport` seam (each write method is exactly one `transport.call(procedure, input, "POST")`), not at the type. No new HTTP verb and no `HostTransport` signature change — the relay/ipc transports already satisfy writes because they already satisfy reads. Web opts in via `createRelayHostWriteClient` (additive, mirrors `createRelayHostClient`).

**Verified procedure mapping** (checked against the host-service tRPC routers in this checkout; each is a `.mutation` = POST):

| Write method | Host procedure | Host input shape | Router source |
| --- | --- | --- | --- |
| `chat.sendMessage` | `chat.sendMessage` | `{ sessionId, workspaceId, payload: { content, files? }, metadata? }` | `packages/host-service/src/trpc/router/chat/chat.ts:57-73` |
| `terminal.write` | `terminal.writeInput` | `{ terminalId, workspaceId, data }` | `packages/host-service/src/trpc/router/terminal/terminal.ts:137-154` |
| `agent.launch` | `agents.run` | `{ workspaceId, agent, prompt, attachmentIds? }` | `packages/host-service/src/trpc/router/agents/agents.ts:299-309` |

Note: the terminal namespace method is `write`, but the host procedure is `terminal.writeInput` (NOT `terminal.write`). `HostAgentLaunchResult` mirrors the value shape of `agentLaunchResultSchema` / `AGENT_LAUNCH_STATUS` (`packages/shared/src/agent-launch.ts:21-26,104-113`); `HostChatSendResult` is kept boundary-opaque (host returns `RuntimeHarness.sendMessage`'s opaque result, `runtime/chat/chat.ts:786-822`).
