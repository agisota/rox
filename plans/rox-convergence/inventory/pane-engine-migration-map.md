# Pane-Engine Migration Map (WS-A deliverable 3)

> v1 **react-mosaic** pane kinds → v2 **`@rox/panes`** equivalents, with the registry contract each needs.
> The de-dup plan for the panes-migration WS: retire the legacy react-mosaic path so a single host-agnostic engine (`@rox/panes`) serves desktop + web.
>
> **Reviewer test (spec §3 task 3):** every v1 pane kind appears with a v2 disposition; cites `TabView/index.tsx` + the v2 registry.

## The two engines

| | v1 (legacy) | v2 (convergence target) |
|---|---|---|
| Engine | `react-mosaic-component` (direct) | `@rox/panes` (generic, headless, host-agnostic) |
| Entry | `screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx` | `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx` |
| Identifier | `MOSAIC_ID = "rox-mosaic"` (`TabView/index.tsx:30`); CSS import `:1`; `Mosaic` import block `:6–9` | `PaneRegistry<PaneViewerData>` (`usePaneRegistry.tsx:116,207`); types from `packages/panes/src/types.ts` |
| Layout model | `MosaicNode<string>` binary split tree (`TabView/index.tsx:102`) | n-ary weighted `LayoutNode` over a flat `panes` map (`packages/panes` README + `types.ts`) |
| State | `renderer/stores/tabs/**` (`useTabsStore`, `TabView/index.tsx:39–45`) | vanilla zustand `createWorkspaceStore` (host/persistence-agnostic) |
| Host scope | local desktop only | host-agnostic (local / relay-attached / cloud-sandbox) |
| Pane contract | hard-wired component imports | `PaneRegistry<TData>` entry per kind: `renderPane`, `getTitle`, `getIcon`, optional `renderToolbar` |

## v1 pane kinds → v2 disposition

v1 imports its pane components directly in `TabView/index.tsx:22–28`: `BrowserPane`, `ChatPane`, `CommentPane`, `DevToolsPane`, `FileViewerPane`, `TabPane`.
v2 registers kinds in `usePaneRegistry.tsx` (each with the `PaneRegistry` contract).

| v1 pane kind (import @ `TabView/index.tsx`) | v2 kind (registry @ `usePaneRegistry.tsx`) | Disposition | v2 contract present |
|---|---|---|---|
| `BrowserPane` (`:22`) | browser kind (`getIcon` Globe `:460`, `getTitle` `:461`, `renderPane` `:471`, `renderToolbar` `:474`) | **mapped** | `renderPane`+`getTitle`+`getIcon`+`renderToolbar` ✓ |
| `ChatPane` (`:23`) | chat kind (`getIcon` MessageSquare `:484`, `getTitle` "Chat" `:485`, `renderPane` `:489`) | **mapped** | `renderPane`+`getTitle`+`getIcon` (no toolbar) |
| `CommentPane` (`:24`) | comment kind (`getIcon` `:511`, `getTitle` `:524`, `renderPane` `:531`) | **mapped** | `renderPane`+`getTitle`+`getIcon` |
| `DevToolsPane` (`:26`) | devtools kind (`getTitle` "DevTools" `:543`, `renderPane` `:544`) | **mapped (thin)** | `renderPane`+`getTitle` (no icon/toolbar) |
| `FileViewerPane` (`:27`) | file kind (`getIcon` `:210`, `getTitle` `getFileName` `:215`, `renderPane` `:227`) | **mapped** (renamed FileViewer→file) | `renderPane`+`getTitle`+`getIcon` |
| `TabPane` (`:28`) | **no direct equivalent** — generic catch-all in v1 | **missing / re-scope** | — |

## v2-only kinds (no v1 equivalent)

| v2 kind | registry @ `usePaneRegistry.tsx` | note |
|---|---|---|
| terminal | `kind: "terminal"` (`:187`); `getIcon` `:303`, `getTitle` "Terminal" `:312`, `renderPane` `:352` | v1 had terminal under `ContentView/TabsContent/Terminal/**`, not as a mosaic pane kind |
| changes/diff | `getIcon` GitCompareArrows `:284`, `getTitle` "Changes" `:285`, `renderPane` `:286` | v1 surfaced diffs via `ChangesContent` + `RightSidebar`, not as a pane |

## Migration findings

1. **5 of 6 v1 pane kinds map 1:1** to v2 registry entries (Browser, Chat, Comment, DevTools, FileViewer→file). Each already satisfies the `PaneRegistry` contract on the v2 side.
2. **`TabPane` (v1 generic) has no v2 equivalent.** The migration WS must decide: drop it (if it was only a placeholder/empty-tab host) or add a generic v2 kind. **Action: trace `TabPane`'s actual content before migrating** — it is the only v1 kind without a v2 home.
3. **v2 is a superset** — it adds first-class `terminal` and `changes/diff` panes that v1 handled outside the mosaic (terminal as a separate component; diffs via `ChangesContent`/`RightSidebar`). The migration is therefore mostly **retire v1**, not build-new — v2 already covers the surface.
4. **Contract gaps to fill on the v2 side during migration:** `chat`, `comment`, `devtools` lack `renderToolbar`; `devtools` also lacks `getIcon`. If v1 panes had per-pane toolbars/icons that users rely on, port them into the v2 registry entries.
5. **State migration** is the real work: v1 `renderer/stores/tabs/**` (mosaic binary tree) → v2 `createWorkspaceStore` (n-ary `LayoutNode` + flat `panes` map). A one-time layout translator (binary `MosaicNode` → weighted `LayoutNode`) is needed if existing v1 layouts must be preserved.

## Recommendation for the panes-migration WS

- Treat v2 `@rox/panes` as the single target engine; **retire** `TabView/index.tsx` (react-mosaic) and `renderer/stores/tabs/**`.
- Port the 5 mapped kinds' missing toolbar/icon contract bits; resolve `TabPane` (drop or add generic kind).
- Provide a `MosaicNode → LayoutNode` translator only if v1 saved layouts must survive the cutover; otherwise reset layouts on migration.
