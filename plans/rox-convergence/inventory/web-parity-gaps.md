# Web-Parity Gaps (WS-A deliverable 6)

> Consolidated, ranked list of host-coupled desktop surfaces blocking web parity. The master backlog input for P0/P1/P2 sequencing.
> Each gap cites the coupling `file:line` from deliverables 1–5.
>
> **Reviewer test (spec §3 task 6):** each gap cites a coupling file:line drawn from the other inventory docs.

## Ranking model

Severity = (how hard to port) × (how central the surface is). `P0` = blocks the convergence target outright; `P1` = a real user-facing parity gap; `P2` = polish / non-blocking.

| # | Gap | Coupling (file:line) | Source doc | Severity | Recommended resolution |
|---|---|---|---|---|---|
| **G1** | **Saved Prompts is desktop-only (local-db)** | `SavedPromptsView.tsx:1` (`SelectSavedPrompt` from `@rox/local-db`), `:47,57,66,75` (`electronTrpc.savedPrompts.list/create/update/delete`) | screen-coupling-matrix (Saved Prompts row); deliverable 1 | **P1** | Read via host abstraction (relay → host local-db, host-scoped plane per DECISIONS D6) OR promote the store to a cloud-tRPC table. |
| **G2** | **Quick Chat transcript is in-memory only** | `QuickChatView.tsx:48–54` (`useState` messages); completion is cloud `apiClient.chat.complete.mutate` `:115` (portable) | screen-coupling-matrix (Quick Chat row) | **P2** | Decide if web expects durable chat; if so persist the transcript (the lazily-created `chat_sessions` row write location is untraced — spec §7b#2). Read path is otherwise portable. |
| **G3** | **Legacy v1 workspace runs on react-mosaic (local-only)** | `TabView/index.tsx:1` (CSS), `:6–9` (`Mosaic`), `:30` (`MOSAIC_ID`), state `renderer/stores/tabs/**` | pane-engine-migration-map; deliverable 3 | **P0** | Retire v1 mosaic; converge on `@rox/panes` (`v2-workspace/.../usePaneRegistry.tsx`), which is host-agnostic. 5/6 pane kinds already map; only `TabPane` unresolved. |
| **G4** | **Two duplicated sidebars; legacy one is local-only** | legacy `WorkspaceSidebar.tsx:23` (`useWorkspaceShortcuts` over electron-tRPC `workspaces.*`); ports `PortsList.tsx:23`, `MergedPortBadge.tsx:30` (`external.openUrl`) | sidebar-dedup-spec; deliverable 5 | **P1** | Adopt `DashboardSidebar` (Electric + hybrid-host aware) as canonical; delete `WorkspaceSidebar/**`. |
| **G5** | **`external.openUrl` / `shell.openExternal` callsites are desktop-only IPC** | 18 renderer `external.openUrl` callsites + 10 main `shell/shellApi.openExternal` (see registry tables B & C) | external-link-registry; deliverable 2 | **P1** | Host-agnostic `openExternal(url)` adapter: desktop → `external.openUrl` (keep `isSafeExternalUrl`, `external/index.ts:116`); web → `window.open`. The 16 `window.open` callsites already work on web. |
| **G6** | **macOS native-permission deep-links have no web equivalent** | `native-permissions.ts:113,121,144,158,195,203` (6 `shellApi.openExternal(PERMISSION_SETTINGS_URLS.*)`, unguarded) | external-link-registry §B | **P2** | Desktop-only by nature; web must hide/disable these affordances. Not portable, not blocking. |
| **G7** | **Command-palette `openInProvider` (Finder / native app) + auto-update are desktop-only** | `openIn/commands.ts:57` (`external.openInFinder`), `:59` (`external.openInApp`); `actions/commands.tsx:35,123` (settings/auto-update IPC) | command-palette-provider-inventory; deliverable 4 | **P2** | Hide these commands on web (no Finder / native-app / desktop-updater equivalent). Other 2 providers + navigation are portable. |
| **G8** | **File-search palette depends on host filesystem** | `screens/main/.../CommandPalette/CommandPalette.tsx:9,11` (`useFileSearch`/`useV2FileSearch`), props `workspaceId`/`onSelectFile` | command-palette-provider-inventory (correction note) | **P1** | Route file search through the host abstraction (relay → host fs, host-scoped plane per D6). |

## Already-portable (no gap) — for completeness

| Surface | Why portable | Evidence |
|---|---|---|
| **Tasks** | Electric live query, org-level, via electric-proxy (D6 org plane) | `TasksView.tsx:10,42` |
| **Automations** | Electric read + cloud-tRPC mutations | `automations/page.tsx:80,94,104` |
| **Pipelines** | pure cloud-tRPC (Neon) | `PipelinesIndex.tsx:20,49,52` |
| `window.open` external nav (16 callsites) | cross-platform API | external-link-registry §A |
| palette `workspaceProvider` + navigation router commands | data-via-context / router-only | command-palette-provider-inventory |

## Suggested sequencing for the master plan

- **P0 (blocks the target):** G3 (pane-engine convergence on `@rox/panes`). Without it there is no single host-agnostic workspace.
- **P1 (real parity gaps, do next):** G1 (Saved Prompts host-backing), G4 (sidebar de-dup), G5 (`openExternal` adapter), G8 (host filesystem search). These unblock the bulk of the `_dashboard` shell on web.
- **P2 (polish / hide-on-web):** G2 (Quick Chat durability — only if web requires it), G6 (native-permission deep-links — hide), G7 (Finder/native-app/auto-update palette commands — hide).

## Cross-reference

All eight gaps trace to deliverables 1–5 in this directory:
`screen-coupling-matrix.md`, `external-link-registry.md`, `pane-engine-migration-map.md`, `command-palette-provider-inventory.md`, `sidebar-dedup-spec.md`.
DECISIONS alignment: D6 (two read planes — host-scoped via relay, org/account via Electric) is the resolution mechanism for G1/G5/G8.
