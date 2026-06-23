# External-Link Registry (WS-A deliverable 2)

> Every external-navigation callsite in the desktop app, as a table `{file:line, mechanism, URL/const, guard}`.
> Target list for the `openExternal` host-adapter workstream: each row is a callsite that web must satisfy with a host-agnostic `openExternal` adapter (`window.open` works in both Electron and the browser; `external.openUrl` / `shell.openExternal` are desktop-only and need a web fallback).
>
> **Reviewer test (spec §3 task 2):** the grep counts below equal the row counts in each section. Run from repo root:
> ```sh
> # window.open (renderer), excluding tests + the two code-comment mentions (OSC 8, new-window events):
> grep -rn "window\.open(" apps/desktop/src/renderer --include="*.ts" --include="*.tsx" \
>   | grep -v "\.test\." | grep -v "// " | grep -v "OSC 8" | grep -v "new-window events"   # → 16
> # shell/shellApi.openExternal (main process), excluding the `type ShellApi` declaration:
> grep -rn "shell\.openExternal(\|shellApi\.openExternal(" apps/desktop/src/lib --include="*.ts" \
>   | grep -v "type ShellApi"                                                               # → 10
> # external.openUrl (renderer) callsites = grep hits minus the 2 console.error log strings:
> grep -rn "external\.openUrl\b" apps/desktop/src/renderer --include="*.ts" --include="*.tsx" \
>   | grep -v "\.test\." | grep -v "//"                                                     # → 20 lines = 18 callsites + 2 log strings
> ```
> **Counts:** `window.open` = **16**, `shell/shellApi.openExternal` (main) = **10**, `external.openUrl` (renderer) = **18 callsites**.

## Mechanisms

1. **`window.open(url, "_blank", …)`** — renderer-direct. Works in Electron AND the browser → **lowest web-parity risk**.
2. **`electronTrpc(.Client).external.openUrl.mutate(url)`** — renderer → main IPC → `shell.openExternal`. Desktop-only. Guarded by `isSafeExternalUrl` in `apps/desktop/src/lib/trpc/routers/external/index.ts:116` (throws `TRPCError` on unsafe scheme, `:122`).
3. **`shell.openExternal` / `shellApi.openExternal`** — main-process direct (used by routers). `external/index.ts:127` is behind the `isSafeExternalUrl` guard; `native-permissions.ts` calls `shellApi.openExternal` **directly with NO `isSafeExternalUrl` guard** (the URLs are hardcoded `PERMISSION_SETTINGS_URLS` constants); `auth/index.ts:100` opens a built `connectUrl` directly; the two `electron-app/factories/*` callsites open URLs from window/app open-handlers.

> **Guard note (resolves spec §7b#1):** not all external nav is allowlisted. `external.openUrl` IS guarded by `isSafeExternalUrl`; `native-permissions.ts`, `auth/index.ts`, and the `electron-app/factories` callsites are **not** routed through that guard. The host-adapter WS must preserve per-callsite guard semantics, not assume a single allowlist.

---

## A. `window.open` (renderer-direct) — 16 callsites

| # | file:line | URL / const |
|---|---|---|
| 1 | `commandPalette/modules/navigation/commands.tsx:49` | `"https://docs.rox.one"` (Открыть документацию) |
| 2 | `screens/main/hooks/useCreateOrOpenPR/useCreateOrOpenPR.ts:28` | `result.url` (create-PR result) |
| 3 | `screens/main/hooks/useCreateOrOpenPR/useCreateOrOpenPR.ts:53` | `result.url` (open-PR result) |
| 4 | `screens/main/components/WorkspaceSidebar/PortsList/PortsList.tsx:23` | `PORTS_DOCS_URL` |
| 5 | `screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/CommitInput/CommitInput.tsx:158` | `prUrl` |
| 6 | `components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill/LinkedIssuePill.tsx:32` | `url` (linked issue) |
| 7 | `components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill/LinkedIssuePill.tsx:36` | `url` (linked issue, fallback) |
| 8 | `components/ConfigFilePreview/ConfigFilePreview.tsx:32` | `EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS` |
| 9 | `routes/_authenticated/settings/integrations/components/IntegrationsSettings/IntegrationsSettings.tsx:103` | `` `${env.NEXT_PUBLIC_WEB_URL}${path}` `` |
| 10 | `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/hooks/useReviewTab/components/CommentsSection/CommentsSection.tsx:604` | `comment.url` |
| 11 | `routes/_authenticated/_dashboard/tasks/components/TasksView/components/PullRequestsContent/PullRequestsContent.tsx:129` | `url` (PR row) |
| 12 | `routes/_authenticated/_dashboard/tasks/components/TasksView/components/GitHubIssuesContent/GitHubIssuesContent.tsx:181` | `url` (issue row) |
| 13 | `routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx:327` | `pr.url` |
| 14 | `routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/DashboardSidebarPortsList.tsx:23` | `PORTS_DOCS_URL` |
| 15 | `routes/_authenticated/onboarding/page.tsx:62` | `"https://cli.github.com/"` |
| 16 | `routes/_authenticated/onboarding/page.tsx:124` | (gh CLI install URL) |

## B. `shell.openExternal` / `shellApi.openExternal` (main process) — 10 callsites

| # | file:line | URL / const | guard |
|---|---|---|---|
| 1 | `lib/trpc/routers/external/index.ts:127` | `input` (arbitrary, from renderer) | `isSafeExternalUrl` (`:116`, throws `:122`) |
| 2 | `lib/trpc/routers/auth/index.ts:100` | `connectUrl` (Rox-cloud provider-connect deep-link, built `:87–92`) | none (built URL) |
| 3 | `lib/trpc/routers/permissions/native-permissions.ts:113` | `PERMISSION_SETTINGS_URLS.fullDiskAccess` | none (hardcoded) |
| 4 | `lib/trpc/routers/permissions/native-permissions.ts:121` | `PERMISSION_SETTINGS_URLS.accessibility` | none (hardcoded) |
| 5 | `lib/trpc/routers/permissions/native-permissions.ts:144` | `PERMISSION_SETTINGS_URLS.microphone` | none (hardcoded) |
| 6 | `lib/trpc/routers/permissions/native-permissions.ts:158` | `PERMISSION_SETTINGS_URLS.screenRecording` | none (hardcoded) |
| 7 | `lib/trpc/routers/permissions/native-permissions.ts:195` | `PERMISSION_SETTINGS_URLS.appleEvents` | none (hardcoded) |
| 8 | `lib/trpc/routers/permissions/native-permissions.ts:203` | `PERMISSION_SETTINGS_URLS.localNetwork` | none (hardcoded) |
| 9 | `lib/electron-app/factories/app/setup.ts:50` | `url` (open-url handler) | OS/window handler |
| 10 | `lib/electron-app/factories/windows/create.ts:12` | `url` (new-window handler) | OS/window handler |

> **Note (supersedes spec §1.1#5 and §7a#2):** native-permissions exposes **6** settings deep-links (fullDiskAccess, accessibility, microphone, screenRecording, appleEvents, localNetwork) — not 4 or 5. `screenRecording` (`:158`) and `localNetwork` (`:203`) were missing from earlier spec drafts. All 6 enumerated above.

## C. `external.openUrl` (renderer → IPC → main) — 18 callsites

| # | file:line | URL / const |
|---|---|---|
| 1 | `screens/main/components/WorkspaceSidebar/WorkspaceListItem/WorkspaceStatusBadge.tsx:42` | mutation handle (PR/status URL) |
| 2 | `screens/main/components/WorkspaceSidebar/PortsList/components/MergedPortBadge/MergedPortBadge.tsx:30` | mutation handle (port URL) |
| 3 | `screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts:194` | `uri` (terminal OSC link) |
| 4 | `screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/components/BrowserToolbar/components/BrowserOverflowMenu/BrowserOverflowMenu.tsx:36` | mutation handle (browser current URL) |
| 5 | `components/MarkdownEditor/MarkdownEditor.tsx:378` | `href` (markdown link) |
| 6 | `components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth/useAnthropicOAuth.ts:96` | `url` (Anthropic OAuth) — via `openExternalUrl` wrapper (`:94`) |
| 7 | `components/Chat/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth/useOpenAIOAuth.ts:70` | `url` (OpenAI OAuth) — via `openExternalUrl` wrapper (`:68`) |
| 8 | `components/UpdateToast/UpdateToast.tsx:35` | mutation handle (update URL) |
| 9 | `components/UpdateRequiredPage/UpdateRequiredPage.tsx:21` | mutation handle (update URL) |
| 10 | `routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/RepositorySection/RepositorySection.tsx:22` | mutation handle (repo URL) |
| 11 | `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx:305` | `url` (v2 terminal OSC link) |
| 12 | `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/components/BrowserOverflowMenu/BrowserOverflowMenu.tsx:57` | `currentUrl` (v2 browser pane) |
| 13 | `routes/_authenticated/_dashboard/cli/page.tsx:28` | mutation handle (DOCS_URL + skill repos, used `:57,186`) |
| 14 | `routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/components/DashboardSidebarPortBadge/DashboardSidebarPortBadge.tsx:29` | mutation handle (port URL) |
| 15 | `routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarExpandedWorkspaceRow/DashboardSidebarExpandedWorkspaceRow.tsx:107` | mutation handle (workspace URL) |
| 16 | `routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceStatusBadge/DashboardSidebarWorkspaceStatusBadge.tsx:24` | mutation handle (status URL) |
| 17 | `routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHelpMenu/DashboardSidebarHelpMenu.tsx:32` | mutation handle (`COMPANY.DOCS_URL` `:74`, `COMPANY.REPORT_ISSUE_URL` `:88`) |
| 18 | `routes/_authenticated/onboarding/components/OnboardingNavigation/OnboardingNavigation.tsx:28` | mutation handle (onboarding URL) |

> Excluded from the count: 2 `console.error("[model-picker] external.openUrl failed:", …)` log strings (`useAnthropicOAuth.ts:98`, `useOpenAIOAuth.ts:72`) — they match the grep but are not callsites.

## URL constants (source of truth)

- `packages/shared/src/constants.ts` — `COMPANY.GITHUB_URL`, `COMPANY.DOCS_URL`, `COMPANY.REPORT_ISSUE_URL` (URL-constants region; per MASTER-PLAN this `:17-28` block is touched only by WS-A/WS-B, distinct from `FEATURE_FLAGS`).
- `apps/desktop/src/shared/constants.ts` — `EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS`.

## Web-adapter recommendation

- **Group A (`window.open`)** — already cross-platform; no adapter needed. Web keeps `window.open`.
- **Group B/C (`external.openUrl` / `shell.openExternal`)** — replace with a host-agnostic `openExternal(url)` from the host abstraction: desktop binds it to `external.openUrl` (preserving `isSafeExternalUrl`); web binds it to `window.open(url, "_blank", "noopener,noreferrer")`. The macOS `PERMISSION_SETTINGS_URLS` deep-links (B#3–8) are desktop-only and have **no web equivalent** — web must hide/disable those affordances.
