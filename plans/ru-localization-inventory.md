# Russian Localization — Phase‑2 Inventory

Status of `apps/desktop/src/renderer` Russian localization after **Phase 1**
(dashboard shell + sidebar + settings navigation). This file lists the
user‑facing English strings that were intentionally **left untranslated** in
Phase 1, grouped by surface, so a Phase‑2 pass can pick them up.

Phase‑1 scope (now done): `DashboardSidebar/**` (nav, header, help menu,
context menus, hover cards, delete dialogs, ports list, V2 setup card, and the
sidebar action hooks) plus a confirmation that the **settings navigation +
section/page titles** in `settings/components/SettingsSidebar/**` and the
`settings/*/page.tsx` headers are already Russian.

## Conventions established in Phase 1 (reuse these in Phase 2)

| English | Russian |
|---|---|
| workspace | рабочее пространство |
| Workspaces (nav) | Рабочие пространства |
| Automations | Автоматизации |
| Tasks & PRs | Задачи и PR |
| New Workspace | Новое рабочее пространство |
| Settings | Настройки |
| Add repository | Добавить репозиторий |
| Rename / Delete / Copy | Переименовать / Удалить / Скопировать |
| Remove from Sidebar | Убрать с боковой панели |
| group (sidebar section) | группа |
| branch | ветка |
| Open / Merged / Closed / Draft (PR) | Открыт / Влит / Закрыт / Черновик |
| Approved / Changes requested / Review pending | Одобрено / Запрошены правки / Ожидает ревью |
| checks | проверки |
| Open in Finder | Открыть в Finder (Finder = имя собственное) |
| View on GitHub | Открыть в GitHub |

**Keep as‑is (never translate):** `Rox`, `GitHub`, `PR`, `MCP`, `Git`,
`Finder`, `Linear`, `Slack`, `Anthropic`, `OpenAI`, `Stripe`, route paths,
`data-*`, React `key`s, `className`, env‑var names, CLI command examples,
URLs, and email/placeholder examples that are technical tokens
(`user@example.com`, `bun run dev`, `https://github.com/owner/repo`, etc.).

---

## Highest priority (primary product surfaces still in English)

### `screens/main/**` — V1 Workspace view (~56 user‑visible strings)
The legacy V1 workspace UI is largely untranslated. Highest‑traffic spots:

- `screens/main/components/WorkspaceView/RightSidebar/ChangesView/ChangesView.tsx`
  — discard/stash confirmation titles + success toasts
  (e.g. "Discard all staged changes?", "Changes stashed",
  "Discarded all unstaged changes", "Stash applied and removed").
- `.../ChangesView/components/CommitInput/CommitInput.tsx`
  — toasts "Pushed" / "Pulled" / "Synced" / "Fetched" / "Committed";
  placeholder "Commit message".
- `.../ChangesView/components/ChangesHeader/ChangesHeader.tsx`
  — placeholder "Search branches...".
- `.../ChangesView/components/ChangesHeader/components/PRButton/PRButton.tsx`
  — "Merging PR...", "PR merged successfully".
- `.../ChangesView/components/ReviewPanel/ReviewPanel.tsx`
  — aria‑label "Open comment on GitHub".
- `.../ContentView/TabsContent/TabView/ChatPane/**`
  — chat placeholders/aria: "Type your answer...", "Edit message...",
  "Add feedback for revisions...", "Find in chat", "Find next match",
  "Close find in chat".
- `.../ContentView/TabsContent/TabView/CommentPane/CommentPane.tsx`
  — aria‑label "View on GitHub".
- `.../ContentView/TabsContent/Terminal/TerminalSearch/TerminalSearch.tsx`
  and `.../FileViewerPane/components/MarkdownSearch/MarkdownSearch.tsx`
  — placeholder "Find".
- `.../RightSidebar/FilesView/components/FileTreeToolbar/FileTreeToolbar.tsx`
  — placeholder "Search files...".
- `screens/main/components/WorkspacesListView/WorkspacesListView.tsx`
  — placeholder "Search...".

### `components/**` (shared renderer components, ~45 strings)
Cross‑cutting components rendered on multiple surfaces. Sweep
`apps/desktop/src/renderer/components/**` for JSX text, `aria-label`,
`placeholder`, `toast.*`, and dialog titles. Notable: the V2 availability
banner, paywall, navigation controls, project thumbnail tooltips,
add‑repository modals (`AddRepositoryModals/**`).

---

## Medium priority (dashboard feature routes)

### `routes/_authenticated/_dashboard/tasks/**` (~39 strings)
Tasks & PRs view — column headers, filters, empty states, status labels,
toasts. Confirm task **status names** terminology with the linked‑task badge
already used in the sidebar.

### `routes/_authenticated/_dashboard/automations/**` (~20 strings)
Automations list/detail — titles, buttons, empty states, toasts.
(See `plans/20260417-automations.md` for feature context.)

### `routes/_authenticated/_dashboard/v2-workspaces/**` (~9 strings)
V2 workspaces list view — header/empty‑state/filter copy.

---

## Lower priority / smaller surfaces

### `routes/_authenticated/settings/**` (≈6–17 leftover strings)
Settings **navigation and section/page titles are already Russian.** What
remains is deeper body copy + a few labels:

- `settings/teams/.../CreateTeamButton/CreateTeamButton.tsx` and
  `settings/teams/$teamId/.../TeamDetailSettings.tsx`
  — `<Label>Slug</Label>`, `<TableHead>Email</TableHead>`.
- `settings/hosts/$hostId/.../WorktreeLocationSection/WorktreeLocationSection.tsx`
  — `<h3>Worktree</h3>`.
- `settings/project/$projectId/.../ProjectSettings.tsx`
  — `<SettingsSection title="Worktree">`.
- `settings/billing/.../BillingDetails/BillingDetails.tsx`
  — "Link by Stripe" (Stripe = proper noun; decide whether to translate "Link by").
- `settings/appearance/.../MarkdownStyleSection.tsx`
  — `<SelectItem>Tufte</SelectItem>` (proper noun — likely leave).
- Misc placeholders that are **technical examples** (`Acme Inc.`, `acme-inc`,
  `claude --dangerously-skip-permissions`, `e.g. bun run dev`,
  `ANTHROPIC_AUTH_TOKEN`, `https://api.anthropic.com`, `CLIENT_KEY...`,
  `user@example.com`, `my-remote-host`, `https://github.com/owner/repo`) —
  **leave as‑is.**
- `settings/utils/settings-search/settings-search.ts` — `SETTINGS_ITEMS[].title`
  and `.description` are an **English search index** (used by
  `searchSettings()` for substring matching and badge counts; not rendered as
  nav labels). The `keywords` arrays power English‑language search.
  **Decision deferred:** translating titles/descriptions risks breaking the
  search experience for users who type English; if localized, the `keywords`
  arrays should keep their English terms (and gain Russian synonyms) rather
  than be replaced.

### `routes/_authenticated/onboarding/**`
Onboarding flow (GitHub auth dialog, provider connect modal, setup page) — not
part of the dashboard shell; partially Russian. Sweep for remaining English.

### `routes/sign-in/page.tsx`
Sign‑in screen is already mostly Russian ("Входим..."). One borderline string
remains: `"Войти как Local Admin (dev)"` — the **"Local Admin (dev)"** fragment
is a dev‑only affordance. Decide whether to localize ("Войти как локальный
администратор (dev)") or keep the technical label.

---

## Out of scope / shared infrastructure (handle deliberately, not as UI strings)

- `apps/desktop/src/renderer/lib/host-service-unavailable.ts` — builds toast
  text from an English prefix `` `Cannot ${action}: ` ``. Phase‑1 sidebar code
  passes an English `action` string **on purpose** so the combined toast stays
  grammatical. To localize, translate the **prefix in the helper** and then the
  `action:` strings at every call site together (cross‑surface change).
- Host‑service / server‑generated strings surfaced verbatim in the renderer
  (e.g. `DestroyConfirmPane` `blockingReason` from
  `useDestroyDialogState` → `preview.reason`, and `result.warnings` toasts in
  `useDestroyDialogState.ts`). These originate outside the renderer; localize at
  the source package, not in the UI layer.
- Sherif / monorepo tooling output, `console.*`, and `*.test.*` — never UI.

---

## Suggested Phase‑2 ordering

1. `screens/main/**` ChangesView + ChatPane (highest user traffic).
2. Shared `components/**` (touches many surfaces at once).
3. `tasks/**`, then `automations/**`, then `v2-workspaces/**`.
4. Settings body copy + the `settings-search` index decision.
5. Onboarding + sign‑in fragment + the shared `host-service-unavailable` helper.
