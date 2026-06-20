# Command-Palette Provider Inventory (WS-A deliverable 4)

> The 4 command providers + frame/sub-frame components + command sources, flagging which commands are **desktop-only** (electron-tRPC / `external.*` IPC).
> Palette parity checklist for web.
>
> **Reviewer test (spec §3 task 4):** provider count matches `commandPalette/modules/index.ts` (= **4**).

## Architecture (the main palette)

Entry: `commandPalette/ui/CommandPalette/CommandPalette.tsx`. Host wrapper: `commandPalette/CommandPaletteHost.tsx`.

- **Shell** — `Dialog` + `AnimatedDialogContent` (`@rox/ui/motion`) + `cmdk` `Command`/`CommandInput`. A `QueryContext` provider exposes the live query to frames.
- **Frame stack** — `core/frames.ts` (`useFrameStackStore`: `open/frames/pushFrame/popFrame/reset`). Commands with `children`/`renderFrame` push a sub-palette; Backspace on empty query pops. Two render branches: `SubPaletteView` (in a frame) vs `CommandListView` (root).
- **Registry (plugin-style)** — `core/registry.ts` is a `Map<id, CommandProvider>` with subscribe/snapshot (`registerProvider`). Aggregated by `core/useActiveCommands.ts`; context (navigate, current workspace, …) from `core/ContextProvider.tsx`; execution by `core/execute.ts`; sectioning by `core/sections.ts`; types in `core/types.ts`.

## The 4 providers (`commandPalette/modules/index.ts`) — registration order

| # | Provider | Source file | Desktop-only commands? |
|---|---|---|---|
| 1 | `workspaceProvider` | `modules/workspace/commands` (`index.ts:5,9`) | No electron-tRPC / `external.*` / `window.*` in the provider itself (workspace data via context). **Portable.** |
| 2 | `actionsProvider` | `modules/actions/commands.tsx` (`index.ts:2,10`) | **Yes** — `electronTrpcClient.settings.setNotificationSoundsMuted` (`commands.tsx:35`), `electronTrpcClient.autoUpdate.checkInteractive` (`:123`). Desktop-only IPC. |
| 3 | `openInProvider` | `modules/openIn/commands.ts` (`index.ts:4,11`) | **Yes** — `electronTrpcClient.external.openInFinder` (`commands.ts:57`), `electronTrpcClient.external.openInApp` (`:59`). Desktop-only (Finder / native app launch — no web equivalent). |
| 4 | `navigationProvider` | `modules/navigation/commands.tsx` (`index.ts:3,12`) | **Partial** — `window.open("https://docs.rox.one", …)` (`commands.tsx:49`) is cross-platform; the rest (Настройки/Недавно просмотренные/Рабочие области via `renderFrame`) are portable router/data commands. |

> **Count test:** `grep -c "registerProvider(" commandPalette/modules/index.ts` → **4** (`workspaceProvider`, `actionsProvider`, `openInProvider`, `navigationProvider` at `index.ts:9–12`). Matches this table.

There is also a `modules/settings/` directory feeding `settingsTabCommands` (children of the Настройки navigation command) — these are router-navigation commands, portable.

## Frame / sub-frame components (`commandPalette/ui/`)

| Component | Role |
|---|---|
| `CommandPalette/` | shell (Dialog + cmdk + QueryContext) |
| `CommandListView/` | root command list render branch |
| `SubPaletteView/` | in-frame render branch |
| `CommandItemRow/` | single command row |
| `RecentlyViewed/` | recently-viewed frame |
| `WorkspaceList/` | workspace-list frame |
| `ThemeFrame/` | theme picker frame |
| `LinkTask/` | link-task frame |
| `QuickOpen/` | quick-open frame |
| `DeleteWorkspaceMount/` | action mount (delete workspace) |
| `RemoveFromSidebarMount/` | action mount (remove from sidebar) |
| `SetPreferredOpenInAppMount/` | action mount (set default open-in app) |

## Core modules (`commandPalette/core/`)

`ContextProvider.tsx`, `execute.ts`, `frames.ts`, `registry.ts`, `sections.ts`, `types.ts`, `useActiveCommands.ts`.

## Correction: the "shim" is a separate palette (resolves spec §7b#4)

`screens/main/components/CommandPalette/CommandPalette.tsx` is **NOT** a wiring shim for the `commandPalette/` module. It is a **distinct file-search palette** scoped to a workspace: props `{ workspaceId, open, onOpenChange, onSelectFile, variant: "v1"|"v2", recentlyViewedFiles, openFilePaths }` (`:17–25`), built on `@rox/ui/command` `CommandPrimitive` + `useFileSearch`/`useV2FileSearch` (`:9,11`). It does file fuzzy-search and emits `onSelectFile`, unrelated to the global command registry. The two palettes coexist; do not conflate them.

## Web-parity checklist

| Command group | Web disposition |
|---|---|
| `workspaceProvider` (all) | port as-is (data via context) |
| `navigationProvider` router commands + `window.open` docs | port as-is (cross-platform) |
| `actionsProvider` settings/auto-update IPC | needs cloud or host adapter; auto-update is desktop-only → **hide on web** |
| `openInProvider` openInFinder/openInApp | **desktop-only, no web equivalent → hide on web** |
| file-search palette (`screens/main/.../CommandPalette.tsx`) | depends on host filesystem read → route through host abstraction (relay → host fs per D6) |
