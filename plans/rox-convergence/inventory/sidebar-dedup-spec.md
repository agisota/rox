# Sidebar De-dup Spec (WS-A deliverable 5)

> Side-by-side inventory of the two desktop sidebars — `WorkspaceSidebar` (legacy, v1 in-workspace) vs `DashboardSidebar` (shell) — to a leaf-component level, with a recommended single source of truth.
>
> **Reviewer test (spec §3 task 5):** both trees enumerated to leaf components with file paths.

## What they are

- **`WorkspaceSidebar`** (legacy / v1) — `screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx`. The in-workspace project/workspace tree used by the **legacy v1 workspace shell**. Local-host only (electron-tRPC `workspaces.*`). Props: `{ isCollapsed, activeProjectId, activeProjectName }` (`:12–16`).
- **`DashboardSidebar`** (shell) — `routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`. The sidebar of the **`_dashboard` shell** that wraps BOTH v1 and v2 workspace generations. Electric-backed + hybrid-host aware (`v2Hosts`, `getFlattenedV2WorkspaceIds`).

Both render the same conceptual thing (a project → workspace tree with DnD, ports, setup-script, header/footer) — this is the duplication.

## Tree A — `WorkspaceSidebar` (legacy)

Root: `screens/main/components/WorkspaceSidebar/`

```
WorkspaceSidebar.tsx              # entry (:18) — groups via useWorkspaceShortcuts (:23), selection store (:24)
├─ SidebarDropZone/               # drag-a-Git-repo wrapper (:73)
├─ WorkspaceSidebarHeader/        # header incl. NewWorkspaceButton (:74)
├─ ProjectSection/                # one per project (:82)
│  ├─ components/                 # ProjectHeader, CloseProjectDialog, etc.
│  └─ ProjectThumbnail/           # project icon/thumbnail
├─ WorkspaceList/                 # list of workspaces in a project
├─ WorkspaceListItem/             # rich row
│  └─ components/                 # WorkspaceHoverCard (→PRStatusBadge/ReviewStatus/ChecksList/ChecksSummary), DeleteWorkspaceDialog, RenameBranchDialog; + WorkspaceIcon/WorkspaceStatusBadge/WorkspaceDiffStats/WorkspaceAheadBehind/CollapsedWorkspaceItem/WorkspaceContextMenu
├─ WorkspaceSection/             # section grouping (useSectionMutations)
├─ RenameInput/                   # inline rename
├─ PortsList/   (:110)            # ports, only when expanded
│  ├─ components/                 # WorkspacePortGroup, MergedPortBadge
│  └─ hooks/                      # usePortsData, useKillPort
├─ SetupScriptCard/  (:112)
├─ WorkspaceSidebarFooter.tsx (:118)
├─ MultiDragPreview/  (:119)      # multi-select DnD preview
├─ hooks/                         # sidebar-local hooks (useSectionDropZone, …)
├─ utils/                         # reorderProjectChildrenInCache, …
├─ constants.ts
├─ types.ts
└─ index.ts
```
State: `useWorkspaceShortcuts()` (groups), `useWorkspaceSelectionStore` (multi-select), local Escape handler (`:44–58`).

## Tree B — `DashboardSidebar` (shell)

Root: `routes/_authenticated/_dashboard/components/DashboardSidebar/`

```
DashboardSidebar.tsx              # entry
├─ components/
│  ├─ DashboardSidebarHeader/
│  ├─ DashboardSidebarProjectSection/
│  ├─ DashboardSidebarSection/
│  ├─ DashboardSidebarSectionRenameContext/
│  ├─ SortableSectionHeader/
│  ├─ SortableWorkspaceItem/
│  ├─ DashboardSidebarWorkspaceItem/        # rich row (+ ExpandedWorkspaceRow, WorkspaceStatusBadge children)
│  ├─ DashboardSidebarHoverCardOverlay/
│  ├─ DashboardSidebarPortsList/            # ports (+ DashboardSidebarPortBadge)
│  ├─ DashboardSidebarDeleteDialog/
│  ├─ DashboardSidebarHelpMenu/             # DOCS_URL + REPORT_ISSUE_URL via external.openUrl
│  ├─ SidebarDragOverlay/
│  └─ V2SetupScriptCard/
├─ hooks/
│  ├─ useDashboardSidebarData/
│  ├─ useDashboardSidebarShortcuts/
│  ├─ useNavigateAwayFromWorkspace/
│  └─ useSidebarDnd/
├─ providers/
│  └─ DashboardSidebarHoverProvider/
├─ utils/
│  ├─ filterSidebarGroups/
│  ├─ getFlattenedV2WorkspaceIds/            # hybrid-host aware
│  └─ projectChildren/
├─ types.ts
└─ index.ts
```
State: `useDashboardSidebarData` (groups, Electric-aware), `useDashboardSidebarShortcuts`, `useSidebarDnd`, `DashboardSidebarHoverProvider`.

## Functional overlap (1:1 concept duplication)

| Concept | Legacy (Tree A) | Shell (Tree B) |
|---|---|---|
| Entry | `WorkspaceSidebar.tsx` | `DashboardSidebar.tsx` |
| Header | `WorkspaceSidebarHeader/` | `DashboardSidebarHeader/` |
| Project group | `ProjectSection/` | `DashboardSidebarProjectSection/` |
| Section grouping | `WorkspaceSection/` | `DashboardSidebarSection/` + `SortableSectionHeader/` |
| Workspace row | `WorkspaceListItem/` (+ components) | `DashboardSidebarWorkspaceItem/` (+ Expanded/StatusBadge) |
| Hover card (PR/checks) | `WorkspaceHoverCard/` | `DashboardSidebarHoverCardOverlay/` + `DashboardSidebarHoverProvider/` |
| Ports | `PortsList/` (+ MergedPortBadge, hooks) | `DashboardSidebarPortsList/` (+ PortBadge) |
| Setup script | `SetupScriptCard/` | `V2SetupScriptCard/` |
| Delete dialog | `WorkspaceListItem/.../DeleteWorkspaceDialog` | `DashboardSidebarDeleteDialog/` |
| DnD | `useSectionDropZone` + `MultiDragPreview/` + `utils/reorder…` | `useSidebarDnd/` + `SidebarDragOverlay/` |
| Data hook | `useWorkspaceShortcuts()` | `useDashboardSidebarData/` |
| Help menu | (in footer / elsewhere) | `DashboardSidebarHelpMenu/` |

## Key differences

1. **Host model.** Tree A is local-only (`workspaces.*` electron-tRPC). Tree B is hybrid-host aware (`v2Hosts`, `getFlattenedV2WorkspaceIds`) and Electric-backed — i.e. already the convergence-friendly one.
2. **DnD library/approach** differs (legacy bespoke `useSectionDropZone`/cache reorder vs shell `useSidebarDnd` + `@dnd-kit`-style sortable components `SortableSectionHeader`/`SortableWorkspaceItem`).
3. **Hover card** — Tree A composes it inline under `WorkspaceListItem`; Tree B promotes it to a provider + overlay (`DashboardSidebarHoverProvider` + `DashboardSidebarHoverCardOverlay`).
4. **Setup script** — `SetupScriptCard` (v1) vs `V2SetupScriptCard` (v2).

## Recommendation — single source of truth

**Adopt `DashboardSidebar` (Tree B) as the canonical sidebar; retire `WorkspaceSidebar` (Tree A).** Rationale:
- Tree B is already host-agnostic / hybrid-host aware (the convergence direction, DECISIONS D6) and Electric-backed (portable to web read path).
- Tree A is bound to the legacy v1 mosaic workspace, which is itself the deprecation candidate (see pane-engine-migration-map.md).
- Migration steps for the sidebar-dedup WS:
  1. Confirm Tree B covers every Tree A affordance (the overlap table above is the checklist — all 12 concepts have a Tree B home).
  2. Port any Tree-A-only polish (e.g. specific hover-card sub-badges `ChecksSummary`/`ReviewStatus` if missing in B) into Tree B components.
  3. Remove `WorkspaceSidebar/**` once the v1 workspace shell is retired with the react-mosaic engine.
- **Net deletion:** ~18 leaf components/dirs under `WorkspaceSidebar/**` collapse into the existing Tree B set.
