# Screen Coupling Matrix (WS-A deliverable 1)

> Authoritative per-`_dashboard`-screen map of **data source**, **host-coupling**, and **web-parity gap**.
> Every "data source" cell cites a `file:line` in this branch (`apps/desktop/src/renderer/**`).
> Consumed by the host-abstraction WS to prioritize which screens already run host-independently and which must be ported.
>
> **Reviewer test (spec §3 task 1):** spot-check 5 rows against the named source files; every "data source" cell must cite a file:line.

## Column taxonomy

- **Data source** — `Electric` (ElectricSQL live query via `useCollections()`), `cloud-tRPC` (Neon-backed `apiTrpcClient` / `useCloudTrpc`), `electron-tRPC` (local-db via `electronTrpc.*`, desktop IPC only), `local-state` (in-memory React state).
- **Host-coupling** — `host-agnostic` (works unchanged on web because the read/write API is cloud or org-level), `cloud-ok` (cloud-tRPC, server-side, portable but desktop-wired), `local-only` (requires the Electron main process / local-db / IPC — cannot run in a browser as-is).
- **Web-parity-gap** — `yes` = needs a host-backed or cloud adapter before web can render it; `no` = already portable.

## Matrix

| Screen | Route → View | Data source (file:line) | Host-coupling | Web-parity-gap |
|---|---|---|---|---|
| **Tasks** | `_dashboard/tasks/page.tsx` → `TasksView/TasksView.tsx` | Electric live query `useCollections()` (`TasksView.tsx:10,42`); UI filters in `stores/tasks-filter-state` (`TasksView.tsx:14`); PR/issue rows via tRPC + `window.open` (`PullRequestsContent.tsx:129`, `GitHubIssuesContent.tsx:181`) | host-agnostic (Electric is org-level, served via electric-proxy per D6) | no |
| **Pipelines** | `_dashboard/pipelines/page.tsx` → `PipelinesIndex` (+ `pipelines/$pipelineId` → `PipelineEditor`) | cloud-tRPC `useCloudTrpc` — `trpc.pipeline.list` (`PipelinesIndex.tsx:20,49`) + `pipeline.createDraft` (`:52`); templates local `PIPELINE_TEMPLATES` (`:21`) | cloud-ok (Neon, server-side) | no |
| **Automations** | `_dashboard/automations/page.tsx` (+ `automations/$automationId` editor) | Electric `useCollections()` incl. `v2Hosts` (`page.tsx:80,151`); `apiTrpcClient.automation.runNow/delete` (`:94,104`); `describeSchedule` from `@rox/shared/rrule` (`:8`); `useRecentProjects` (`:61,140`); `authClient.useSession()` (`:81`) | host-agnostic read (Electric) + cloud-ok mutations | no |
| **Quick Chat** | `_dashboard/quick-chat/page.tsx` → `QuickChatView` | local-state only — `useState` model/reasoning/input/messages/isSending (`QuickChatView.tsx:48–54`); `apiClient.chat.complete.mutate` (`:115`); models from `@rox/shared/chat-models` (`:6`); staged prompt via `useQuickChatDraftStore` (`:24,46`) | cloud-ok (completion is cloud-tRPC) BUT transcript is in-memory only | yes (transcript not durable; see web-parity-gaps.md G2) |
| **Saved Prompts** | `_dashboard/saved-prompts/page.tsx` → `SavedPromptsView` | electron-tRPC (local-db) — `electronTrpc.savedPrompts.list/create/update/delete` (`SavedPromptsView.tsx:47,57,66,75`); `SelectSavedPrompt` from `@rox/local-db` (`:1`); staging via `useQuickChatDraftStore.stagePrompt` (`:44`) | local-only (local-db, desktop IPC) | yes (clearest gap; see G1) |

## Supporting (`_dashboard` shell surfaces, for completeness)

| Surface | Data source (file:line) | Host-coupling | Web-parity-gap |
|---|---|---|---|
| **DashboardSidebar** (shell tree) | Electric collections + electron-tRPC ports/help; `external.openUrl` for ports/help links (`DashboardSidebarHelpMenu.tsx:32`, `DashboardSidebarPortBadge.tsx:29`) | mixed: Electric (host-agnostic) + electron-tRPC port/open links (local-only) | partial (open-external + ports need host adapter) |
| **WorkspaceSidebar** (legacy in-workspace tree) | `useWorkspaceShortcuts()` (`WorkspaceSidebar.tsx:23`) over electron-tRPC `workspaces.*`; `external.openUrl` for ports (`PortsList.tsx:23`, `MergedPortBadge.tsx:30`) | local-only (electron-tRPC workspace data) | yes (legacy v1; deprecation candidate — see sidebar-dedup-spec.md) |
| **CommandPalette** | provider registry over workspace/navigation data; `external.openUrl` + `window.open` commands (see command-palette-provider-inventory.md) | mixed | partial (desktop-only commands flagged in palette inventory) |

## Notes for downstream

- **Tasks/Automations are the most portable** — Electric live queries are org/account-scoped and already flow through `electric-proxy` (DECISIONS D6: org/account durable data stays on Electric). No host adapter needed for the read path.
- **Pipelines** is pure cloud-tRPC (Neon), portable as soon as web wires the same `apiTrpcClient`.
- **Saved Prompts is the single hard local-only screen** — its store lives in `@rox/local-db`. Web parity requires either a host-backed read (relay → host local-db, per D6 host-scoped plane) or promoting the store to a cloud table.
- **Quick Chat** writes are cloud-tRPC (portable) but the visible transcript is ephemeral React state; web parity depends on whether web expects durable chat (open question, spec §7b#2 — the lazily-created `chat_sessions` row write location is not traced here).
- Run-in-workspace deep-links from Tasks target the **v2-workspace** generation (`tasks/$taskId/.../OpenInWorkspaceV2/OpenInWorkspaceV2.tsx`), i.e. the convergence target, not the legacy v1 mosaic workspace. (Resolves spec §7b#3.)
