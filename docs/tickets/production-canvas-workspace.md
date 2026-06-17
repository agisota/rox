# Production Canvas Workspace for Rox

Status: design ready for parallel implementation
Owner: Rox product/engineering
Repository: `github.com/agisota/rox`
Local repo: `/Users/marklindgreen/Documents/rox`
Target document: `docs/tickets/production-canvas-workspace.md`
Date: 2026-06-17
Language: Russian-first, identifiers in English

## 0. BLUF

Мы не строим MVP.

Мы строим сразу production-grade `Canvas Workspace` внутри Rox: визуально, функционально и UX-близко к Obsidian Canvas, но с Rox-native сущностями: agent sessions, chats, messages, notes, artifacts, files, links, prompts, tasks, generated outputs и future automation capabilities.

Единственный продуктовый slice:

```text
Production Obsidian-grade Canvas Workspace for Rox
```

Все этапы ниже являются не урезанными версиями продукта, а параллельными implementation workstreams, merge gates и verification gates для одной финальной системы.

Ключевое архитектурное решение:

```text
CanvasDocument is the canonical truth.
Renderer state is disposable.
Persistence + MutationLog + Index are production responsibilities from day one.
```

Рекомендуемая Implementation:

```text
CanvasWorkspace Module
  -> CanvasDocument Module
  -> CanvasRenderer Interface
  -> ReactFlowCanvasAdapter Implementation
  -> NodeContentAdapter Interface
  -> CanvasPersistence Interface
  -> SessionCanvasStorageAdapter Implementation
  -> CanvasIndexAdapter Implementation
  -> CanvasMutationLog Module
  -> CanvasCapabilityRegistry Module
  -> canvas:* RPC Interface
```

## 1. Product premise

### 1.1 Non-negotiable intent

Пользователь хочет встроить Obsidian-like Canvas в Rox. Это не исследовательская гипотеза и не optional feature. Это product direction.

Проект должен исходить из следующих фактов:

- Canvas будет интегрирован.
- Canvas должен быть production-grade, а не MVP.
- Canvas должен быть визуально и функционально близок к Obsidian Canvas.
- Canvas должен использовать chats, agent sessions и notes как first-class nodes.
- Canvas должен предусматривать plugin-inspired capabilities заранее.
- Canvas должен быть реализован параллельно несколькими агентами и ветками.
- Canvas должен стать новым spatial workspace layer внутри Rox, а не просто одним экраном.

### 1.2 Product goal

Создать в Rox пространственную рабочую среду, где пользователь может собирать, связывать, группировать, трансформировать и запускать agentic actions над knowledge/workflow graph, состоящим из:

- agent sessions;
- chat threads;
- individual messages;
- notes;
- artifacts;
- files;
- URLs;
- prompts;
- tasks;
- generated plans;
- tool outputs;
- other canvases.

### 1.3 User value

Canvas решает проблему линейности chat UX.

Текущее состояние многих agent tools:

```text
linear chat timeline
  -> context buried in messages
  -> hard to compare alternatives
  -> hard to preserve decisions
  -> hard to reuse fragments
  -> hard to compose workflows visually
```

Target Rox state:

```text
spatial canvas workspace
  -> sessions become movable graph objects
  -> notes become structured knowledge nodes
  -> artifacts become inspectable graph nodes
  -> user can select graph context and run agents on it
  -> decisions, prompts, outputs and tasks remain visible
  -> canvas becomes both thinking surface and execution surface
```

## 2. Evidence and source context

### 2.1 Local repo evidence

Read-only repo exploration identified the following useful Rox surfaces:

- `apps/electron/src/shared/routes.ts` - route construction and workbench route shape.
- `apps/electron/src/shared/route-parser.ts` - URL normalization and parsing.
- `apps/electron/src/renderer/contexts/NavigationContext.tsx` - navigation state and panel stack state.
- `apps/electron/src/renderer/App.tsx` - app wrapper.
- `apps/electron/src/renderer/components/app-shell/AppShell.tsx` - shell, side navigation, workbench entry points.
- `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx` - main content dispatch.
- `apps/electron/src/renderer/components/app-shell/PanelStackContainer.tsx` - multi-panel Depth.
- `apps/electron/src/renderer/components/workbench/WorkbenchRoutePage.tsx` - best UI insertion point for Canvas screen.
- `apps/webui/src/App.tsx` - WebUI adapter to renderer.
- `packages/core/src/types/workspace.ts` - `Workspace`, `WorkspaceInfo`, `StoredConfig`.
- `packages/core/src/types/session.ts` - `Session`, `StoredSession`, `SessionMetadata`.
- `packages/core/src/types/message.ts` - `Message`, `StoredMessage`, `AgentEvent`, annotations and event payloads.
- `packages/shared/src/sessions/types.ts` - shared session schema.
- `packages/shared/src/sessions/storage.ts` - session filesystem storage, import/export/watch patterns.
- `packages/shared/src/protocol/channels.ts` - channel definitions.
- `packages/shared/src/protocol/routing.ts` - local/remote routing policy.
- `apps/electron/src/transport/channel-map.ts` - renderer/preload/main channel surface.
- `apps/electron/src/transport/routed-client.ts` - local vs remote workspace route choice.
- `packages/server-core/src/handlers/session-manager-interface.ts` - session orchestration Interface.
- `packages/server-core/src/handlers/rpc/sessions.ts` - server-side session RPC handlers.
- `packages/server-core/src/handlers/account-ownership.ts` - access enforcement.
- `packages/server-core/src/handlers/storage-scope.ts` - storage scope derivation.
- `packages/server-core/src/persistence/adapter.ts` - persistence Adapter Interface.

### 2.2 Obsidian/vault evidence pointers

The Obsidian capability inventory already exists in the user's vault and should be treated as source material for the capability matrix:

```text
/Users/marklindgreen/agi Dropbox/RAMZAN KADYROV/_INBOX/Gronxie Dropbox/MARK HAGGERTY/_NOTES/vault-v2/90_System/09_Docs/Obsidian FeatureCapability Inventory.md
/Users/marklindgreen/agi Dropbox/RAMZAN KADYROV/_INBOX/Gronxie Dropbox/MARK HAGGERTY/_NOTES/vault-v2/90_System/09_Docs/Obsidian FeatureCapability Inventory.csv
/Users/marklindgreen/agi Dropbox/RAMZAN KADYROV/_INBOX/Gronxie Dropbox/MARK HAGGERTY/_NOTES/vault-v2/90_System/09_Docs/Obsidian FeatureCapability Inventory.json
/Users/marklindgreen/agi Dropbox/RAMZAN KADYROV/_INBOX/Gronxie Dropbox/MARK HAGGERTY/_NOTES/vault-v2/90_System/09_Docs/Obsidian Generated Command Inventory.md
/Users/marklindgreen/agi Dropbox/RAMZAN KADYROV/_INBOX/Gronxie Dropbox/MARK HAGGERTY/_NOTES/vault-v2/90_System/09_Docs/Obsidian Vault Capability Specification RU.md
/Users/marklindgreen/agi Dropbox/RAMZAN KADYROV/_INBOX/Gronxie Dropbox/MARK HAGGERTY/_NOTES/vault-v2/90_System/09_Docs/Obsidian Vault Capability Specification EN.md
```

Observed inventory scale:

- 132 installed community plugins.
- 108 enabled community plugins.
- 24 disabled community plugins.
- 25 core Obsidian features.
- 3551 FeatureCapability rows.
- 1035 generated command rows.
- 15 obsidian-shellcommands command/config objects with redacted bodies.

Production Rox Canvas must not blindly clone every plugin. It must capture the feature classes and capability surfaces that matter for the Canvas and knowledge workflow.

### 2.3 External compatibility references

Canvas import/export should be aligned with:

- JSON Canvas: `https://jsoncanvas.org/`
- Obsidian JSON Canvas reference: `https://github.com/obsidianmd/jsoncanvas`
- React Flow / xyflow docs: `https://reactflow.dev/api-reference/react-flow`
- tldraw schema/features as possible future adapter reference: `https://tldraw.dev/`

## 3. Current state X

### 3.1 UI/navigation current state

Rox already has a workbench-oriented navigation pattern.

Current useful properties:

- `workbench/{screen}` shape exists or is naturally supported by the route model.
- `WorkbenchRoutePage` centralizes workbench screen dispatch.
- `AppShell` owns navigation entry points.
- `MainContentPanel` dispatches main route content and already recognizes workbench navigation.
- Navigation state is not React Router-first; it uses URL/query/history plus application state.
- Jotai and React Context are already used for UI state.
- Panel stack/focus concepts already exist and may affect Canvas fullscreen behavior.
- WebUI appears to be an adapter layer around the shared renderer/runtime.

Current gaps:

- no Canvas route;
- no Canvas workbench screen;
- no Canvas renderer Interface;
- no canvas-specific panel/inspector/tooling;
- no node palette;
- no canvas keyboard shortcut map;
- no canvas command palette integration;
- no visual parity layer with Obsidian Canvas.

### 3.2 Data/current domain state

Rox already has strong session/message/workspace foundations.

Current useful properties:

- `Workspace` and `WorkspaceInfo` provide workspace identity and mode/state metadata.
- `Session` and `StoredSession` provide session identity, metadata and persistence context.
- `Message` and `StoredMessage` provide temporal event/message stream context.
- `AgentEvent` provides event-stream patterns useful for future Canvas events.
- session storage already uses filesystem sidecars and structured subdirectories.
- notes already exist in a session-adjacent pattern.
- import/export bundle patterns exist around sessions.

Current gaps:

- no `CanvasDocument` domain;
- no `CanvasNode` / `CanvasEdge` / `CanvasGroup` entities;
- no node reference model linking graph nodes to Rox entities;
- no mutation log for spatial operations;
- no Canvas snapshot/restore model;
- no canvas index;
- no canvas search Interface;
- no `CanvasCapability` model.

### 3.3 Transport/current RPC state

Rox already has transport seams.

Current useful properties:

- channel definitions exist;
- local vs remote routing policy exists;
- Electron channel map exists;
- server RPC handlers exist;
- account/workspace/session access helpers exist;
- session notes channels can be used as a pattern;
- WebSocket push/watch primitives exist.

Current gaps:

- no `canvas:*` RPC surface;
- no Canvas watch/push events;
- no Canvas access policy;
- no Canvas channel routing classification;
- no renderer preload/main API surface for Canvas;
- no server-side validation for canvas mutations.

## 4. Target state Y

### 4.1 Product target

Rox has a first-class Canvas Workspace where users can:

- create canvases;
- open canvases from a library;
- import Obsidian JSON Canvas files;
- export JSON Canvas files;
- create and manipulate nodes visually;
- connect nodes with directional and labeled edges;
- group nodes;
- style nodes and edges;
- create notes inside canvas;
- link nodes to existing sessions/messages/artifacts/files;
- run agent actions on selected nodes, edges, groups or whole canvases;
- use command palette actions based on current selection;
- search and filter canvas contents;
- persist and restore state across app restarts;
- work across local and remote workspaces with correct routing and access checks;
- recover from mutation log/snapshots;
- inspect node metadata and references;
- use the canvas as both thinking surface and execution surface.

### 4.2 Technical target

The system has production-grade Modules:

```text
CanvasWorkspace Module
CanvasDocument Module
CanvasRenderer Module
CanvasPersistence Module
CanvasIndex Module
CanvasMutationLog Module
CanvasCapabilityRegistry Module
NodeContentAdapter Module
CanvasImportExport Module
CanvasSearch Module
CanvasAccessPolicy Module
CanvasVerification Module
```

The system has stable Interfaces:

```text
CanvasRenderer Interface
CanvasPersistence Interface
CanvasIndex Interface
CanvasMutationValidator Interface
CanvasCapability Interface
NodeContentAdapter Interface
JsonCanvasCodec Interface
CanvasRpc Interface
CanvasAccessPolicy Interface
```

The system has swappable Implementations:

```text
ReactFlowCanvasAdapter
SessionCanvasStorageAdapter
SqliteCanvasIndexAdapter
JsonCanvasCodecV1
ChatSessionNodeAdapter
NoteNodeAdapter
MessageNodeAdapter
ArtifactNodeAdapter
FileNodeAdapter
UrlNodeAdapter
TextNodeAdapter
```

## 5. Architecture principles

### 5.1 Canonical truth principle

`CanvasDocument` owns truth.

React Flow state must be a projection, not the source of truth.

```text
CanvasDocument
  -> renderer projection
  -> user interaction
  -> CanvasMutation
  -> validated domain update
  -> persistence/index/update
  -> renderer projection refresh
```

### 5.2 Adapter isolation principle

Do not leak React Flow types into core/shared/server-core.

Allowed:

```text
CanvasDocument -> CanvasRendererProjection -> ReactFlow nodes/edges
```

Not allowed:

```text
core/shared CanvasNode extends ReactFlowNode
server storage writes ReactFlow edge payloads as canonical state
```

### 5.3 Mutation-first principle

All meaningful changes should be expressed as `CanvasMutation`.

Benefits:

- undo/redo;
- replay;
- audit;
- sync conflict handling;
- autosave batching;
- agent-action traceability;
- debugging;
- future collaboration.

### 5.4 Reference-first node principle

Nodes should not duplicate large entity bodies by default.

A node may contain embedded content for text/link cards, but Rox entity-backed nodes should link through `CanvasNodeRef`.

Examples:

```text
chat session node -> ref: { type: "session", sessionId }
note node -> ref: { type: "note", noteId, sessionId? }
message node -> ref: { type: "message", sessionId, messageId }
artifact node -> ref: { type: "artifact", artifactId, sessionId? }
```

### 5.5 Production storage principle

Production scope requires hybrid storage from day one.

```text
Filesystem
  -> canonical document, patches, snapshots, assets, bundles

SQLite/index
  -> search, refs, summaries, audit, fast list/query
```

### 5.6 Security principle

Canvas must never be a bypass around session/workspace authorization.

Every Canvas RPC must enforce:

```text
workspace access before workspace canvas operation
session access before session-linked canvas operation
node ref access before resolving linked entity previews
```

## 6. High-level Module map

```text
apps/electron/src/renderer/components/workbench/canvas/
  CanvasWorkspaceScreen
  CanvasToolbar
  CanvasLeftRail
  CanvasSurface
  CanvasInspector
  CanvasStatusBar
  CanvasCommandPaletteBridge
  CanvasKeyboardShortcuts
  adapters/react-flow/

packages/core/src/types/canvas.ts
  CanvasDocument
  CanvasNode
  CanvasEdge
  CanvasGroup
  CanvasNodeRef
  CanvasMutation
  CanvasCapability

packages/shared/src/canvas/
  schema.ts
  mutations.ts
  json-canvas-codec.ts
  projections.ts
  validation.ts

packages/shared/src/protocol/
  canvas channels and routing classification

packages/shared/src/sessions/
  storage extensions for canvas artifacts

packages/server-core/src/handlers/rpc/canvas.ts
  Canvas RPC handlers

packages/server-core/src/canvas/
  persistence adapter
  index adapter
  access policy
  capability runtime
```

## 7. Data Model

### 7.1 Entity diagram

```text
Workspace
  owns many CanvasDocument
  owns many Session

Session
  owns many Message
  owns session notes
  may own/session-scope many CanvasDocument

CanvasDocument
  owns many CanvasNode
  owns many CanvasEdge
  owns many CanvasGroup
  owns many CanvasMutation
  owns many CanvasSnapshot
  indexes many CanvasNodeRef

CanvasNode
  may embed content
  may reference Session | Note | Message | Artifact | File | URL | Text | Canvas | Task
  may belong to CanvasGroup

CanvasEdge
  connects source CanvasNode -> target CanvasNode
  may carry label, direction, style, semantic relation

CanvasCapability
  acts on CanvasDocument | CanvasSelection | CanvasNode | CanvasEdge | CanvasGroup
  produces CanvasMutation | AgentRun | Note | Session | Artifact | ExportBundle
```

### 7.2 CanvasDocument

```ts
interface CanvasDocument {
  id: string;
  workspaceId: string;
  sessionId?: string;
  title: string;
  description?: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
  view: CanvasViewState;
  metadata: CanvasDocumentMetadata;
  capabilities: CanvasCapabilityBinding[];
  version: number;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
```

Fields:

- `id` - stable Canvas identity.
- `workspaceId` - required ownership scope.
- `sessionId` - optional session scope for session-local canvases.
- `title` - visible canvas name.
- `description` - optional user summary.
- `nodes` - canonical node list.
- `edges` - canonical edge list.
- `groups` - canonical group list.
- `view` - viewport and visual state.
- `metadata` - tags, colors, source, import info, custom fields.
- `capabilities` - canvas-level capability bindings.
- `version` - optimistic concurrency and mutation base.
- `schemaVersion` - migration/version compatibility.
- `createdAt` / `updatedAt` - lifecycle.
- `createdBy` / `updatedBy` - audit/RBAC support.

### 7.3 CanvasDocumentMetadata

```ts
interface CanvasDocumentMetadata {
  tags: string[];
  source?: CanvasSource;
  importedFrom?: CanvasImportMetadata;
  exportHints?: CanvasExportHints;
  defaultNodeStyle?: CanvasNodeStyle;
  defaultEdgeStyle?: CanvasEdgeStyle;
  custom?: Record<string, unknown>;
}
```

### 7.4 CanvasNode

```ts
interface CanvasNode {
  id: string;
  canvasId: string;
  type: CanvasNodeType;
  ref?: CanvasNodeRef;
  position: CanvasPoint;
  size: CanvasSize;
  content: CanvasNodeContent;
  style: CanvasNodeStyle;
  metadata: CanvasNodeMetadata;
  groupId?: string;
  zIndex?: number;
  locked?: boolean;
  collapsed?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

Node invariants:

- `id` is unique within a canvas.
- `position` is canonical, not renderer-only.
- `size` is canonical for Obsidian-like card layout.
- `ref` points to Rox entity when node is entity-backed.
- `content` contains embedded card data or resolved preview cache.
- `metadata` contains tags, source, custom properties, provenance.
- `version` changes when node changes.

### 7.5 CanvasNodeType

```ts
type CanvasNodeType =
  | "text"
  | "note"
  | "session"
  | "message"
  | "artifact"
  | "file"
  | "url"
  | "image"
  | "pdf"
  | "code"
  | "task"
  | "prompt"
  | "tool-call"
  | "canvas"
  | "group-proxy";
```

### 7.6 CanvasNodeRef

```ts
type CanvasNodeRef =
  | { type: "session"; sessionId: string }
  | { type: "note"; noteId: string; sessionId?: string; path?: string }
  | { type: "message"; sessionId: string; messageId: string }
  | { type: "artifact"; artifactId: string; sessionId?: string; path?: string }
  | { type: "file"; path: string; workspaceId?: string }
  | { type: "url"; url: string }
  | { type: "task"; taskId: string; source?: string }
  | { type: "prompt"; promptId?: string; inline?: boolean }
  | { type: "tool-call"; sessionId: string; eventId: string }
  | { type: "canvas"; canvasId: string }
  | { type: "text" };
```

Access policy:

- resolving `session` requires session access;
- resolving `message` requires session access;
- resolving `artifact` requires artifact/session/workspace access;
- resolving `file` requires workspace file scope validation;
- resolving `url` must not auto-fetch without user-visible policy;
- resolving `canvas` requires canvas/workspace access.

### 7.7 CanvasNodeContent

```ts
interface CanvasNodeContent {
  title?: string;
  body?: string;
  markdown?: string;
  plainText?: string;
  preview?: CanvasNodePreview;
  summary?: string;
  language?: string;
  mimeType?: string;
  data?: Record<string, unknown>;
}
```

Content policy:

- embedded text cards may store markdown body directly;
- entity-backed nodes should store preview/cache only, not duplicate source truth;
- previews must be refreshable from `ref`;
- large content belongs to artifacts/files, not node JSON.

### 7.8 CanvasEdge

```ts
interface CanvasEdge {
  id: string;
  canvasId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  relation?: CanvasEdgeRelation;
  label?: string;
  direction: "none" | "forward" | "backward" | "bidirectional";
  style: CanvasEdgeStyle;
  metadata: CanvasEdgeMetadata;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.9 CanvasEdgeRelation

```ts
type CanvasEdgeRelation =
  | "relates-to"
  | "depends-on"
  | "blocks"
  | "supports"
  | "contradicts"
  | "derived-from"
  | "summarizes"
  | "expands"
  | "answers"
  | "references"
  | "implements"
  | "tests"
  | "custom";
```

### 7.10 CanvasGroup

```ts
interface CanvasGroup {
  id: string;
  canvasId: string;
  title?: string;
  position: CanvasPoint;
  size: CanvasSize;
  style: CanvasGroupStyle;
  metadata: CanvasGroupMetadata;
  collapsed?: boolean;
  locked?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.11 CanvasViewState

```ts
interface CanvasViewState {
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  selectedIds: string[];
  focusedNodeId?: string;
  activeTool: CanvasTool;
  filters: CanvasFilterState;
  sort?: CanvasSortState;
  showMinimap: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
}
```

### 7.12 CanvasSelection

```ts
interface CanvasSelection {
  canvasId: string;
  nodeIds: string[];
  edgeIds: string[];
  groupIds: string[];
  bounds?: CanvasRect;
}
```

### 7.13 CanvasMutation

```ts
interface CanvasMutation {
  id: string;
  canvasId: string;
  baseVersion: number;
  type: CanvasMutationType;
  actor: CanvasMutationActor;
  payload: Record<string, unknown>;
  inverse?: Record<string, unknown>;
  createdAt: string;
  correlationId?: string;
  source?: CanvasMutationSource;
}
```

### 7.14 CanvasMutationType

```ts
type CanvasMutationType =
  | "node.create"
  | "node.move"
  | "node.resize"
  | "node.updateContent"
  | "node.updateStyle"
  | "node.bindRef"
  | "node.delete"
  | "edge.create"
  | "edge.update"
  | "edge.delete"
  | "group.create"
  | "group.update"
  | "group.delete"
  | "selection.create"
  | "selection.transform"
  | "note.createFromSelection"
  | "session.createFromSelection"
  | "session.forkFromNode"
  | "artifact.attach"
  | "canvas.import"
  | "canvas.export"
  | "canvas.snapshot"
  | "canvas.restore"
  | "capability.run";
```

### 7.15 CanvasCapability

```ts
interface CanvasCapability {
  id: string;
  title: string;
  description: string;
  category: CanvasCapabilityCategory;
  input: CanvasCapabilityInputSpec;
  output: CanvasCapabilityOutputSpec;
  availability: CanvasCapabilityAvailability;
  handler: string;
  risk: "safe" | "writes-local" | "external" | "destructive";
  requiresConfirmation: boolean;
}
```

### 7.16 CanvasCapabilityCategory

```ts
type CanvasCapabilityCategory =
  | "navigation"
  | "layout"
  | "capture"
  | "linking"
  | "search"
  | "metadata"
  | "automation"
  | "export"
  | "import"
  | "agent-action"
  | "note-action"
  | "session-action"
  | "artifact-action"
  | "visual-transform"
  | "indexing"
  | "validation";
```

## 8. Storage architecture

### 8.1 Production storage layout

Production storage should be hybrid.

Filesystem canonical layout:

```text
<workspace-storage>/canvases/<canvasId>/
  canvas.json
  patches.jsonl
  snapshots/
    <snapshotId>.json
  assets/
    <assetId>.<ext>
  exports/
    <exportId>/
      canvas.canvas
      manifest.json
      assets/
```

Session-scoped layout:

```text
<session-storage>/<sessionId>/canvas/
  canvas.json
  patches.jsonl
  snapshots/
  assets/
  exports/
```

Recommended rule:

- workspace-level canvases live under workspace canvas library;
- session-level canvases live beside session storage;
- both use the same `CanvasDocument` schema;
- `scope` decides storage adapter and access policy.

### 8.2 SQLite/index layer

SQLite/index layer should not be canonical truth. It should be optimized query/index state.

Suggested tables:

```text
canvas_documents
canvas_nodes_index
canvas_edges_index
canvas_refs_index
canvas_tags_index
canvas_capability_runs
canvas_search_index
canvas_snapshots_index
```

`canvas_documents`:

```text
id
workspace_id
session_id nullable
title
description
schema_version
version
node_count
edge_count
group_count
created_at
updated_at
created_by
updated_by
storage_path
```

`canvas_nodes_index`:

```text
id
canvas_id
node_type
ref_type
ref_id
label
summary
tags_json
position_x
position_y
width
height
updated_at
```

`canvas_edges_index`:

```text
id
canvas_id
source_node_id
target_node_id
relation
label
direction
updated_at
```

`canvas_refs_index`:

```text
canvas_id
node_id
ref_type
ref_id
workspace_id
session_id
path
url
updated_at
```

`canvas_capability_runs`:

```text
id
canvas_id
capability_id
actor_id
input_hash
output_ref
status
started_at
finished_at
error
```

### 8.3 Snapshot and patch policy

Production write path:

```text
CanvasMutation batch
  -> validate baseVersion
  -> append to patches.jsonl
  -> apply to in-memory document
  -> persist canvas.json atomically
  -> update index
  -> emit watch event
```

Snapshot policy:

- create snapshot on explicit user action;
- create automatic snapshot before import/restore/destructive bulk actions;
- create periodic snapshot after N mutations or M minutes;
- keep retention policy configurable.

Patch policy:

- `patches.jsonl` is append-only;
- each entry includes `baseVersion`, `resultVersion`, actor, timestamp, mutation batch;
- every mutation should have enough data to support undo where feasible;
- compaction can roll patches into snapshots after safe checkpoints.

## 9. Transport and RPC contract

### 9.1 Channel list

Production channels:

```text
canvas:list
canvas:get
canvas:create
canvas:update
canvas:delete
canvas:patch
canvas:watch
canvas:unwatch
canvas:snapshot
canvas:restore
canvas:importJsonCanvas
canvas:exportJsonCanvas
canvas:exportBundle
canvas:search
canvas:index
canvas:listCapabilities
canvas:runCapability
canvas:getNodeRefs
canvas:resolveNodeRef
canvas:getHistory
canvas:undo
canvas:redo
```

### 9.2 Routing classification

Default:

```text
canvas:* channels are REMOTE_ELIGIBLE
```

Reason:

- canvas belongs to workspace/session state;
- local-only routing risks split state;
- remote workspace must enforce RBAC;
- WebUI/desktop parity needs the same contract.

Local-only exceptions may exist only for UI-only helpers, never for persistence.

### 9.3 RPC input/output contracts

`canvas:list`:

```ts
input: {
  workspaceId: string;
  sessionId?: string;
  query?: string;
  tags?: string[];
  limit?: number;
  cursor?: string;
}
output: {
  items: CanvasDocumentSummary[];
  nextCursor?: string;
}
```

`canvas:get`:

```ts
input: {
  canvasId: string;
  includeIndex?: boolean;
}
output: {
  document: CanvasDocument;
  index?: CanvasIndexSummary;
}
```

`canvas:create`:

```ts
input: {
  workspaceId: string;
  sessionId?: string;
  title: string;
  templateId?: string;
  initialNodes?: CanvasNode[];
}
output: {
  document: CanvasDocument;
}
```

`canvas:patch`:

```ts
input: {
  canvasId: string;
  baseVersion: number;
  mutations: CanvasMutation[];
}
output: {
  document: CanvasDocument;
  appliedMutationIds: string[];
  version: number;
}
```

`canvas:watch`:

```ts
input: {
  canvasId: string;
  sinceVersion?: number;
}
output stream:
  CanvasWatchEvent
```

`canvas:runCapability`:

```ts
input: {
  canvasId: string;
  capabilityId: string;
  selection?: CanvasSelection;
  params?: Record<string, unknown>;
}
output: {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  mutations?: CanvasMutation[];
  artifacts?: CanvasCapabilityArtifact[];
}
```

### 9.4 Watch events

```ts
type CanvasWatchEvent =
  | { type: "canvas.updated"; canvasId: string; version: number; mutations: CanvasMutation[] }
  | { type: "canvas.deleted"; canvasId: string }
  | { type: "canvas.indexed"; canvasId: string; version: number }
  | { type: "canvas.capabilityRunUpdated"; canvasId: string; run: CanvasCapabilityRun };
```

## 10. Security and access policy

### 10.1 Required checks

Every operation must check access before storage or ref resolution.

Rules:

```text
workspace-level canvas list/get/create -> requireWorkspaceAccess
session-level canvas get/patch/delete -> requireSessionAccess
node ref resolution -> require access to referenced entity
file node preview -> validate workspace file scope
artifact node preview -> validate artifact/session/workspace access
canvas import -> validate target workspace/session access
canvas export -> validate source canvas access
capability.run -> validate canvas access + capability-specific permissions
```

### 10.2 Security risks to explicitly test

- unauthorized canvas read;
- unauthorized canvas patch;
- session ref leakage through node preview;
- file path traversal in file nodes;
- import bundle path traversal;
- local-only channel bypass of remote RBAC;
- stale workspace client after workspace switch;
- capability execution without correct selection/ref access;
- exported bundle containing unauthorized linked content.

### 10.3 Confirmation policy for capabilities

Safe capabilities can run immediately.

Examples:

```text
search
filter
zoom
layout preview
validate graph
show backlinks
```

Write capabilities run without confirmation when local and reversible.

Examples:

```text
create note from selection
create group
auto-layout applied with undo mutation
```

High-risk capabilities require confirmation or explicit policy.

Examples:

```text
delete selected files
external publish
run shell command
send data to external API
change workspace permissions
```

## 11. UI/UX specification

### 11.1 Screens

Production Canvas requires these screens/surfaces:

```text
Canvas Library
Canvas Workspace
Canvas Inspector
Canvas Command Palette
Canvas Import/Export Dialogs
Canvas Snapshot/History Dialog
Canvas Capability Run Panel
```

### 11.2 Canvas Library

Purpose:

- locate, create, duplicate, import, export and organize canvases.

Required features:

- list canvases;
- filter by workspace;
- filter by session;
- filter by tags;
- search title/description/indexed nodes;
- create blank canvas;
- create from template;
- duplicate canvas;
- import JSON Canvas;
- import bundle;
- export JSON Canvas;
- export bundle;
- open recent canvas;
- show canvas summary: node count, edge count, updated date, linked sessions.

### 11.3 Canvas Workspace layout

```text
+--------------------------------------------------------------------------------+
| Top Toolbar: select pan connect text note session group search import export     |
+----------+---------------------------------------------------------+-----------+
| Left     |                                                         | Right     |
| Rail     |                  Infinite Canvas Surface                | Inspector |
|          |                                                         |           |
| palette  |   nodes, groups, edges, minimap, selection, overlays    | props     |
| filters  |                                                         | actions   |
| library  |                                                         | refs      |
+----------+---------------------------------------------------------+-----------+
| Status: saved/saving/error | zoom | selection count | version | sync state    |
+--------------------------------------------------------------------------------+
```

### 11.4 Top toolbar

Required tools:

- select;
- pan;
- connect;
- create text card;
- create note card;
- add session node;
- add link node;
- group selection;
- auto-layout;
- search;
- import;
- export;
- snapshot;
- command palette.

### 11.5 Left rail

Required sections:

- Canvas library shortcut;
- Node palette;
- Recent sessions;
- Recent notes;
- Artifacts/files;
- Filters;
- Saved views;
- Templates.

### 11.6 Canvas surface

Required behavior:

- infinite pan;
- zoom in/out;
- zoom to fit;
- zoom to selection;
- grid toggle;
- snap toggle;
- minimap toggle;
- drag node;
- resize node;
- inline edit text node;
- create edges by handle drag;
- context menu on canvas;
- context menu on node;
- context menu on edge;
- keyboard shortcuts;
- multi-select;
- lasso select;
- copy/paste;
- duplicate;
- delete;
- undo/redo;
- autosave;
- selection-aware commands.

### 11.7 Right inspector

Inspector modes:

- no selection;
- single node;
- multi-node selection;
- edge;
- group;
- canvas document;
- capability run.

Single node inspector:

- title;
- node type;
- linked entity ref;
- preview;
- style;
- tags;
- metadata;
- incoming edges;
- outgoing edges;
- backlinks/related sessions;
- actions;
- danger zone.

Multi-node inspector:

- selection summary;
- bulk style;
- group selection;
- align/distribute;
- run agent on selection;
- extract note;
- create task list;
- export selection.

Edge inspector:

- source;
- target;
- relation;
- direction;
- label;
- color/style;
- metadata;
- delete.

Canvas inspector:

- title;
- description;
- tags;
- linked workspace/session;
- stats;
- snapshots;
- import/export;
- index status;
- default styles.

### 11.8 Keyboard shortcuts

Required shortcuts:

```text
Space + drag: pan
Cmd/Ctrl + scroll: zoom
Cmd/Ctrl + 0: zoom to fit
Cmd/Ctrl + F: search canvas
Cmd/Ctrl + K: command palette
Cmd/Ctrl + Z: undo
Cmd/Ctrl + Shift + Z: redo
Cmd/Ctrl + C: copy selected
Cmd/Ctrl + V: paste
Cmd/Ctrl + D: duplicate
Delete/Backspace: delete selected
G: group selected
T: create text node
N: create note node
S: add session node
L: add link node
Escape: clear selection/cancel tool
```

## 12. Obsidian Canvas parity matrix

| Area | Required production capability | Rox adaptation |
| --- | --- | --- |
| Canvas files | Create/open/save canvas documents | `CanvasDocument` + storage Adapter |
| Text cards | Add/edit markdown text cards | `text` node with markdown content |
| File cards | Display linked file/card | `file`, `artifact`, `note` node refs |
| Link cards | URL card preview | `url` node with preview cache |
| Groups | Visual containers | `CanvasGroup` |
| Edges | Connect cards | `CanvasEdge` |
| Edge labels | Label relation | `label` + `relation` |
| Edge direction | Directional arrows | `direction` |
| Colors | Node/group/edge styling | style objects |
| Pan/zoom | Infinite surface | React Flow adapter projection |
| Drag/resize | Spatial editing | mutations: `node.move`, `node.resize` |
| Multi-select | Bulk operations | `CanvasSelection` |
| Context menu | Node/edge/canvas actions | selection-aware command registry |
| Search | Find cards | `CanvasSearch` + index |
| JSON Canvas | Import/export | `JsonCanvasCodec` |
| Backlinks-like behavior | Related refs | `canvas_refs_index` |
| Command palette | Action execution | `CanvasCapabilityRegistry` |

## 13. Rox-native feature matrix

| Feature | Data entity | Mutation/capability | UI surface |
| --- | --- | --- | --- |
| Chat session node | `Session` | `node.create`, `node.bindRef` | node palette, inspector |
| Live agent session node | `Session` + events | `session.forkFromNode`, `capability.run` | session node actions |
| Message node | `Message` | `node.create` from message ref | chat-to-canvas action |
| Note node | `Note` / notes sidecar | `note.createFromSelection` | note node, inspector |
| Artifact node | artifact/file output | `artifact.attach` | artifact palette |
| Prompt node | prompt content/ref | `node.create`, `capability.run` | prompt node actions |
| Task node | task entity/future issue | `selection.transform` | task extraction |
| Tool call node | `AgentEvent` | `node.create` from event | session event graph |
| Canvas node | `CanvasDocument` | `node.bindRef` | nested canvas card |
| Agent on selection | `CanvasSelection` | `capability.run` | command palette |
| Summarize cluster | nodes/edges/groups | `capability.run` -> note/artifact | selection action |
| Generate edges | selected nodes | `edge.create` mutations | graph automation |
| Export graph | canvas/selection | `canvas.export` | export dialog |
| Snapshot restore | `CanvasSnapshot` | `canvas.snapshot`, `canvas.restore` | history dialog |

## 14. Plugin-inspired capability model

### 14.1 Translation rule

Do not clone Obsidian plugins as plugins.

Translate them into Rox Canvas capability categories:

```text
Obsidian plugin feature
  -> FeatureCapability row
  -> Rox CanvasCapability category
  -> Data entities affected
  -> Mutation or read action
  -> UI command/action
  -> security/risk classification
```

### 14.2 Capability categories and examples

#### Navigation capabilities

- `canvas.zoomToFit` - acts on `CanvasViewState`; updates viewport.
- `canvas.zoomToSelection` - acts on `CanvasSelection`; updates viewport.
- `canvas.focusNode` - acts on `CanvasNode`; updates focused state.
- `canvas.openLinkedSession` - resolves `CanvasNodeRef.session`; opens session screen.
- `canvas.openLinkedNote` - resolves `CanvasNodeRef.note`; opens note editor.
- `canvas.openLinkedArtifact` - resolves `CanvasNodeRef.artifact`; opens artifact preview.
- `canvas.jumpToRelated` - uses index refs to navigate related nodes.

#### Layout capabilities

- `canvas.autoLayout` - acts on nodes/edges; emits `node.move` mutations.
- `canvas.cleanLayout` - aligns and spaces selected nodes.
- `canvas.alignLeft` - selection transform.
- `canvas.alignCenter` - selection transform.
- `canvas.alignRight` - selection transform.
- `canvas.distributeHorizontal` - selection transform.
- `canvas.distributeVertical` - selection transform.
- `canvas.groupSelection` - emits `group.create`.
- `canvas.ungroupSelection` - emits `group.delete`.
- `canvas.collapseGroup` - updates `CanvasGroup.collapsed`.
- `canvas.expandGroup` - updates `CanvasGroup.collapsed`.

#### Capture capabilities

- `canvas.captureSession` - creates session node from current session.
- `canvas.captureMessage` - creates message node from selected message.
- `canvas.captureArtifact` - creates artifact node from output.
- `canvas.captureFile` - creates file node from workspace file.
- `canvas.captureUrl` - creates URL node.
- `canvas.captureClipboard` - creates text/link/file node depending clipboard data.
- `canvas.captureSelectionAsNote` - creates note from selected graph.

#### Linking capabilities

- `canvas.linkSelectedNodes` - creates edges between selected nodes.
- `canvas.generateSuggestedEdges` - agent/index suggests relation edges.
- `canvas.showBacklinks` - reads `canvas_refs_index`.
- `canvas.showOutgoingRefs` - reads outgoing edges/refs.
- `canvas.findOrphans` - identifies nodes with no edges.
- `canvas.findCycles` - graph analysis.
- `canvas.markRelation` - updates edge relation.

#### Search capabilities

- `canvas.searchText` - text/index search.
- `canvas.searchSemantic` - semantic search over nodes/summaries.
- `canvas.filterByType` - node type filter.
- `canvas.filterByTag` - metadata filter.
- `canvas.filterBySession` - ref filter.
- `canvas.filterByCapabilityOutput` - result/ref filter.
- `canvas.findStaleRefs` - stale/broken ref validation.

#### Metadata capabilities

- `canvas.tagSelection` - updates node/group/canvas tags.
- `canvas.colorSelection` - updates style.
- `canvas.setRelationType` - updates edge relation.
- `canvas.setNodeTitle` - updates content/title.
- `canvas.setNodeSummary` - updates summary.
- `canvas.refreshPreview` - resolves ref and updates preview cache.
- `canvas.normalizeMetadata` - validates/custom metadata.

#### Automation capabilities

- `canvas.runAgentOnSelection` - sends graph context to agent.
- `canvas.summarizeSelection` - produces note/artifact.
- `canvas.extractTasks` - creates task nodes or task list artifact.
- `canvas.createPlanFromCluster` - produces plan artifact/note.
- `canvas.compareSelectedSessions` - agent comparison over session refs.
- `canvas.generatePromptFromSelection` - creates prompt node.
- `canvas.explainGraph` - produces explanation note.
- `canvas.detectContradictions` - identifies contradicting nodes/edges.

#### Export capabilities

- `canvas.exportJsonCanvas` - JSON Canvas file.
- `canvas.exportMarkdownMap` - Markdown outline.
- `canvas.exportBundle` - document + assets + manifest.
- `canvas.exportSelection` - partial canvas bundle.
- `canvas.exportImage` - visual snapshot.
- `canvas.exportPdf` - printable/report artifact.

#### Import capabilities

- `canvas.importJsonCanvas` - Obsidian-compatible import.
- `canvas.importMarkdownAsNodes` - heading/list to nodes.
- `canvas.importSessionAsCanvas` - session timeline to graph.
- `canvas.importLinksAsGraph` - URL/list to link nodes.
- `canvas.importBundle` - Rox bundle restore.

#### Validation capabilities

- `canvas.validateDocument` - schema and referential integrity.
- `canvas.validateRefs` - linked entity availability.
- `canvas.validateSecurityScope` - access scope check.
- `canvas.validateJsonCanvasRoundtrip` - import/export compatibility.
- `canvas.validateMutationReplay` - replay patches to same document.
- `canvas.validateIndex` - index matches canonical document.

## 15. JSON Canvas import/export

### 15.1 Import rules

JSON Canvas import should map:

```text
text node -> CanvasNode type text
file node -> CanvasNode type file/note/artifact based on path and resolver
link node -> CanvasNode type url
group node -> CanvasGroup
edge -> CanvasEdge
color/style -> CanvasNodeStyle / CanvasEdgeStyle / CanvasGroupStyle
```

Unsupported/unknown properties:

- preserve in `metadata.custom.jsonCanvas` when possible;
- never silently drop source data without import warning;
- report lossy fields in import result.

### 15.2 Export rules

Rox Canvas export to JSON Canvas should:

- include text nodes as text cards;
- include URL nodes as link cards;
- include file/note/artifact nodes as file cards when path is resolvable;
- include groups;
- include edges;
- preserve colors and labels where JSON Canvas supports them;
- include Rox-specific metadata in a namespaced custom area when safe;
- warn about Rox-only features that cannot be represented.

### 15.3 Round-trip acceptance

Required test categories:

- Obsidian JSON Canvas sample imports successfully;
- exported Rox canvas opens in Obsidian where supported;
- import -> export -> import preserves node/edge/group counts;
- lossy fields are reported;
- file/path safety is enforced;
- malicious paths are rejected.

## 16. Renderer architecture

### 16.1 Interface

```ts
interface CanvasRenderer {
  render(document: CanvasDocument, projection: CanvasRendererProjection): JSX.Element;
  focusNode(nodeId: string): void;
  zoomToFit(): void;
  zoomToSelection(selection: CanvasSelection): void;
  getViewport(): CanvasViewState["viewport"];
}
```

### 16.2 React Flow Implementation

Initial Implementation:

```text
ReactFlowCanvasAdapter
```

Responsibilities:

- convert `CanvasDocument.nodes` into React Flow nodes;
- convert `CanvasDocument.edges` into React Flow edges;
- handle drag/resize/connect/select events;
- emit domain mutations;
- render custom node components through `NodeContentAdapter` registry;
- expose viewport commands;
- avoid owning canonical state.

### 16.3 Why React Flow first

React Flow matches the graph/card/edge shape better than tldraw for production v1.

Reasons:

- node/edge model already aligns with Canvas;
- mature interaction model;
- supports custom nodes;
- supports minimap/controls/background patterns;
- quicker path to Obsidian-like Canvas;
- can still be isolated behind `CanvasRenderer Interface`.

### 16.4 Future renderer options

`tldraw` can become another Implementation later if Rox needs:

- freehand whiteboard;
- shape-first editor;
- drawing tools;
- richer geometry engine;
- multiplayer whiteboard patterns.

The Interface protects us from this future decision.

## 17. NodeContentAdapter registry

### 17.1 Interface

```ts
interface NodeContentAdapter {
  type: CanvasNodeType;
  renderNode(node: CanvasNode, context: NodeRenderContext): JSX.Element;
  renderInspector(node: CanvasNode, context: NodeInspectorContext): JSX.Element;
  resolvePreview(ref: CanvasNodeRef, context: NodeResolveContext): Promise<CanvasNodePreview>;
  getActions(node: CanvasNode, context: NodeActionContext): CanvasCapability[];
}
```

### 17.2 Required Implementations

```text
TextNodeAdapter
NoteNodeAdapter
ChatSessionNodeAdapter
MessageNodeAdapter
ArtifactNodeAdapter
FileNodeAdapter
UrlNodeAdapter
ImageNodeAdapter
PdfNodeAdapter
CodeNodeAdapter
TaskNodeAdapter
PromptNodeAdapter
ToolCallNodeAdapter
CanvasNodeAdapter
```

### 17.3 Adapter responsibilities

Each Adapter owns:

- visual card rendering;
- preview resolution;
- inspector fields;
- node-specific commands;
- safe ref resolution;
- stale/missing ref UI;
- export/import mapping hints.

## 18. Agent workflow integration

### 18.1 Selection-to-agent context

Canvas selection should be convertible into agent context.

Context package:

```ts
interface CanvasAgentContext {
  canvasId: string;
  selection: CanvasSelection;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
  resolvedRefs: CanvasResolvedRef[];
  summaries: CanvasNodeSummary[];
  userInstruction?: string;
}
```

### 18.2 Agent actions

Required production actions:

- summarize selected graph;
- compare selected sessions;
- explain selected cluster;
- extract tasks from selected nodes;
- generate note from selected graph;
- generate prompt from selected graph;
- propose missing edges;
- detect contradictions;
- produce implementation plan from selected nodes;
- fork session using selected graph as context;
- continue selected session with graph context.

### 18.3 Output handling

Agent action output may become:

- new note node;
- new artifact node;
- new session node;
- new task nodes;
- new edges;
- new group;
- canvas-level summary;
- capability run record.

Every output that changes canvas must be represented as mutations.

## 19. Parallel branch/worktree plan

### 19.1 Branch topology

One product slice, multiple implementation branches:

```text
main
  -> feat/canvas-contracts
  -> feat/canvas-storage-index
  -> feat/canvas-transport-rpc
  -> feat/canvas-workbench-ui
  -> feat/canvas-node-adapters
  -> feat/canvas-capabilities
  -> feat/canvas-import-export
  -> feat/canvas-verification
```

### 19.2 Worktree allocation

Suggested local worktree naming:

```text
/Users/marklindgreen/Documents/rox-worktrees/canvas-contracts
/Users/marklindgreen/Documents/rox-worktrees/canvas-storage-index
/Users/marklindgreen/Documents/rox-worktrees/canvas-transport-rpc
/Users/marklindgreen/Documents/rox-worktrees/canvas-workbench-ui
/Users/marklindgreen/Documents/rox-worktrees/canvas-node-adapters
/Users/marklindgreen/Documents/rox-worktrees/canvas-capabilities
/Users/marklindgreen/Documents/rox-worktrees/canvas-import-export
/Users/marklindgreen/Documents/rox-worktrees/canvas-verification
```

### 19.3 Merge strategy

Do not merge UI first.

Correct dependency order:

```text
1. feat/canvas-contracts
2. feat/canvas-storage-index
3. feat/canvas-transport-rpc
4. feat/canvas-import-export
5. feat/canvas-node-adapters
6. feat/canvas-capabilities
7. feat/canvas-workbench-ui
8. feat/canvas-verification
```

Parallel implementation is allowed, but merge gates must respect contract dependency.

## 20. Agent ownership matrix

### 20.1 Agent 1: Contracts/domain

Branch:

```text
feat/canvas-contracts
```

Owned Modules:

- `CanvasDocument Module`
- `CanvasMutationLog Module` contracts
- `CanvasCapability` contracts
- schema validators
- projection helpers

Files likely touched:

- `packages/core/src/types/canvas.ts`
- `packages/shared/src/canvas/schema.ts`
- `packages/shared/src/canvas/mutations.ts`
- `packages/shared/src/canvas/validation.ts`
- `packages/shared/src/canvas/projections.ts`
- exports/index files as needed

Deliverables:

- shared/core type definitions;
- runtime validation;
- mutation payload definitions;
- projection helpers;
- fixtures;
- type/unit tests.

Acceptance:

- domain contracts compile;
- invalid mutations rejected;
- sample CanvasDocument validates;
- projection produces renderer-neutral nodes/edges.

### 20.2 Agent 2: Storage/index

Branch:

```text
feat/canvas-storage-index
```

Owned Modules:

- `CanvasPersistence Module`
- `SessionCanvasStorageAdapter Implementation`
- `WorkspaceCanvasStorageAdapter Implementation`
- `CanvasIndexAdapter Implementation`
- snapshot/patch/replay logic

Files likely touched:

- `packages/shared/src/sessions/storage.ts`
- `packages/shared/src/canvas/storage.ts`
- `packages/server-core/src/canvas/persistence.ts`
- `packages/server-core/src/canvas/index.ts`
- `packages/server-core/src/persistence/*`

Deliverables:

- file layout implementation;
- atomic write helper;
- patch append/read;
- snapshot create/restore;
- index update/read;
- import/export storage hooks.

Acceptance:

- create/read/update canvas document;
- append and replay patches;
- restore snapshot;
- index rows match canonical document;
- export bundle contains manifest and assets.

### 20.3 Agent 3: Transport/RBAC

Branch:

```text
feat/canvas-transport-rpc
```

Owned Modules:

- `CanvasRpc Interface`
- `CanvasAccessPolicy Module`
- channel definitions;
- channel routing;
- Electron channel map;
- server RPC handlers.

Files likely touched:

- `packages/shared/src/protocol/channels.ts`
- `packages/shared/src/protocol/routing.ts`
- `apps/electron/src/transport/channel-map.ts`
- `packages/server-core/src/handlers/rpc/canvas.ts`
- `packages/server-core/src/handlers/session-manager-interface.ts`
- `packages/server-core/src/handlers/account-ownership.ts`

Deliverables:

- `canvas:*` channels;
- request/response types;
- handler registration;
- access checks;
- watch events;
- route classification tests.

Acceptance:

- unauthorized read/write denied;
- authorized read/write works;
- channel is remote-eligible;
- watch event emitted after patch;
- stale workspace route does not leak data.

### 20.4 Agent 4: Workbench UI/renderer

Branch:

```text
feat/canvas-workbench-ui
```

Owned Modules:

- `CanvasWorkspace Module`
- `CanvasRenderer Module`
- `ReactFlowCanvasAdapter Implementation`
- toolbar/rail/inspector/status surfaces
- shortcuts/context menus

Files likely touched:

- `apps/electron/src/shared/routes.ts`
- `apps/electron/src/shared/route-parser.ts`
- `apps/electron/src/renderer/components/workbench/WorkbenchRoutePage.tsx`
- `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- `apps/electron/src/renderer/components/workbench/canvas/*`

Deliverables:

- canvas route;
- workbench screen;
- renderer adapter;
- basic production layout;
- toolbar;
- left rail;
- inspector;
- status bar;
- keyboard shortcuts;
- context menus.

Acceptance:

- user can open Canvas workspace;
- canvas loads real persisted document;
- user can create/move/resize/connect/group nodes;
- UI emits domain mutations;
- autosave state visible;
- Obsidian-like interaction baseline works.

### 20.5 Agent 5: Node adapters

Branch:

```text
feat/canvas-node-adapters
```

Owned Modules:

- `NodeContentAdapter Module`
- all core node Implementations
- preview resolution
- inspector actions per type

Files likely touched:

- `apps/electron/src/renderer/components/workbench/canvas/node-adapters/*`
- `packages/shared/src/canvas/node-adapter-types.ts`
- ref resolver surfaces in server/renderer as needed

Deliverables:

- Text node;
- Note node;
- Session node;
- Message node;
- Artifact node;
- File node;
- URL node;
- Prompt/task/tool-call/canvas node shells;
- inspector panels;
- stale ref states.

Acceptance:

- each supported node type renders;
- entity-backed nodes resolve previews safely;
- stale refs are visible and non-crashing;
- node-specific actions appear in inspector/command palette.

### 20.6 Agent 6: Capabilities/automation

Branch:

```text
feat/canvas-capabilities
```

Owned Modules:

- `CanvasCapabilityRegistry Module`
- command palette bridge;
- selection-aware actions;
- graph analysis;
- agent action integration.

Files likely touched:

- `packages/shared/src/canvas/capabilities.ts`
- `packages/server-core/src/canvas/capability-runtime.ts`
- `apps/electron/src/renderer/components/workbench/canvas/capabilities/*`
- command palette integration points

Deliverables:

- capability registry;
- action availability rules;
- run capability RPC;
- safe built-in capabilities;
- agent action capabilities;
- capability run records.

Acceptance:

- command palette shows context-aware canvas commands;
- capabilities operate on current selection;
- write capabilities emit mutations;
- risky capabilities are classified;
- agent action output becomes note/artifact/session/nodes.

### 20.7 Agent 7: Import/export

Branch:

```text
feat/canvas-import-export
```

Owned Modules:

- `JsonCanvasCodec Interface`
- JSON Canvas import/export Implementation;
- Rox bundle export/import;
- lossy mapping reports;
- fixtures.

Files likely touched:

- `packages/shared/src/canvas/json-canvas-codec.ts`
- `packages/shared/src/canvas/import-export.ts`
- `packages/server-core/src/canvas/import-export.ts`
- `apps/electron/src/renderer/components/workbench/canvas/import-export/*`

Deliverables:

- import JSON Canvas;
- export JSON Canvas;
- import/export result reports;
- round-trip tests;
- malicious fixture rejection.

Acceptance:

- Obsidian JSON Canvas fixtures import;
- Rox export opens in Obsidian where supported;
- round-trip preserves counts/positions/labels/groups;
- unsupported data is reported;
- unsafe paths rejected.

### 20.8 Agent 8: Verification/QA

Branch:

```text
feat/canvas-verification
```

Owned Modules:

- test matrix;
- fixtures;
- acceptance scripts;
- UI smoke proof;
- regression tests;
- performance checks.

Files likely touched:

- tests near canvas modules;
- app test harness;
- fixture folders;
- docs/worklog for implementation task;
- acceptance checklist.

Deliverables:

- production acceptance matrix;
- fixture set;
- import/export tests;
- mutation replay tests;
- RBAC tests;
- UI smoke/evidence plan.

Acceptance:

- full production claim has test evidence;
- no self-approval by implementation agents;
- known gaps listed explicitly;
- release candidate gate documented.

## 21. Merge gates

### Gate 1: Contract freeze

Required before storage/transport/UI merge:

- `CanvasDocument` schema stable;
- `CanvasNodeRef` schema stable;
- mutation types stable;
- capability contract stable;
- validation fixtures committed;
- JSON Canvas mapping draft complete.

### Gate 2: Storage + index gate

Required:

- create/read/update/delete canvas;
- atomic write path;
- patch append/replay;
- snapshot/restore;
- index update;
- storage tests.

### Gate 3: Transport/RBAC gate

Required:

- all `canvas:*` channels registered;
- remote routing correct;
- access checks enforced;
- watch events working;
- unauthorized tests passing.

### Gate 4: Renderer gate

Required:

- workbench route opens;
- persisted canvas loads;
- domain mutations emitted from UI;
- node movement/resize/connect/group works;
- autosave indicator works;
- no renderer type leakage into domain.

### Gate 5: Node adapter gate

Required:

- all production node types have rendering path;
- major node types have inspector path;
- previews resolve through secure refs;
- stale refs handled;
- node actions available.

### Gate 6: Capability gate

Required:

- command registry works;
- selection-aware actions work;
- graph actions emit mutations;
- agent actions produce attachable outputs;
- risky action policy enforced.

### Gate 7: Import/export gate

Required:

- JSON Canvas import/export;
- round-trip fixtures;
- lossy mapping reports;
- bundle export/import;
- path safety tests.

### Gate 8: Production acceptance gate

Required:

- UI smoke proof;
- domain/storage/RPC/import tests;
- performance checks;
- RBAC/security checks;
- worklog updated;
- known gaps documented;
- production claim supported by evidence.

## 22. Verification matrix

| Area | Claim | Proof |
| --- | --- | --- |
| Domain | Canvas schema validates valid documents and rejects invalid ones | unit tests |
| Mutations | Patch replay reproduces same document | replay tests |
| Storage | Canvas persists across restart/read cycle | storage tests |
| Index | Index matches canonical document | index consistency tests |
| RPC | Authorized canvas operations work | RPC integration tests |
| RBAC | Unauthorized access denied | negative tests |
| Routing | Remote workspace uses remote-eligible channels | routing tests |
| UI | Canvas opens and edits real document | UI smoke/evidence |
| Nodes | Session/note/artifact/url/text nodes render | component/integration tests |
| Import | Obsidian JSON Canvas imports | fixture tests |
| Export | Rox Canvas exports JSON Canvas | fixture tests |
| Round-trip | import/export/import preserves core graph | round-trip tests |
| Capabilities | Selection-aware commands emit expected mutations | capability tests |
| Agent actions | Selection context produces output node/artifact/note | integration test or mocked agent test |
| Security | Path traversal/import abuse rejected | malicious fixture tests |
| Performance | Large canvas remains usable | large fixture smoke/perf check |

## 23. Performance requirements

Production targets:

- 500 nodes / 800 edges: smooth editing baseline.
- 2000 nodes / 3000 edges: usable navigation with virtualization/projection optimizations.
- autosave debounce avoids write storms.
- patch batches coalesce high-frequency drag events.
- index updates do not block rendering.
- previews resolve lazily.
- large artifact previews are not embedded in canvas JSON.

Implementation requirements:

- use debounced/batched `node.move` patches during drag;
- commit final exact position on drag end;
- lazy-load heavy node previews;
- keep renderer projection memoized;
- avoid re-rendering all nodes on small mutations;
- use index/search asynchronously;
- do not block UI on capability runs.

## 24. Error states

Canvas UI must explicitly handle:

- failed load;
- failed save;
- version conflict;
- unauthorized canvas;
- missing linked session;
- missing linked note;
- missing artifact/file;
- invalid imported JSON Canvas;
- partially lossy import;
- failed capability run;
- index stale;
- watch disconnected;
- remote workspace unavailable.

No silent failure for persistence or import/export.

## 25. Migration strategy

### 25.1 New installs

New Rox installs get:

- empty canvas library;
- default canvas templates;
- no migration required.

### 25.2 Existing sessions

Existing sessions remain unchanged.

Canvas can be created from session:

```text
session -> create canvas from session
  -> session node
  -> optional message summary nodes
  -> optional artifact nodes
  -> optional notes node
```

### 25.3 Existing notes

Existing notes remain notes.

Canvas can reference them using `CanvasNodeRef.note`.

No forced migration from `notes.md` into canvas.

### 25.4 Obsidian import

Obsidian JSON Canvas import creates new `CanvasDocument` with import report.

Do not overwrite existing Rox data unless explicit user action.

## 26. Worklog and repo process

Per repo guidance, implementation should create/update task worklogs.

Recommended worklog root:

```text
docs/worklog/production-canvas-workspace.md
```

Worklog must track:

- branch/worktree;
- owning agent;
- files changed;
- tests run;
- blockers;
- merge gate status;
- unresolved risks.

No implementation branch should claim done without evidence.

## 27. Definition of done

Production Canvas is done when all of the following are true:

- Canvas Library exists.
- Canvas Workspace exists in Workbench.
- Canvas can create/open/save/delete documents.
- Canvas persists across app restart.
- Canvas works through local and remote workspace routing.
- Canvas access checks are enforced.
- User can create, move, resize, copy, paste, duplicate and delete nodes.
- User can connect nodes with edges.
- User can create and edit groups.
- User can style nodes/edges/groups.
- User can use text, note, session, message, artifact, file and URL nodes.
- User can inspect node refs and metadata.
- User can import JSON Canvas.
- User can export JSON Canvas.
- User can export Rox bundle.
- Command palette shows canvas capabilities.
- Selection-aware capabilities run.
- Agent can run on selected graph context.
- Mutation log supports undo/redo/replay.
- Snapshot restore works.
- Index/search works.
- Stale/missing refs are safe and visible.
- Performance is acceptable on large fixtures.
- Security tests cover unauthorized access and path abuse.
- Verification evidence exists.

## 28. Suggested implementation prompt for multi-agent execution

Use this prompt when launching the full parallel implementation:

```text
We are implementing Production Obsidian-grade Canvas Workspace for Rox, not an MVP.

Repository: /Users/marklindgreen/Documents/rox
Spec: docs/tickets/production-canvas-workspace.md

Use multiple worktrees and branches:
- feat/canvas-contracts
- feat/canvas-storage-index
- feat/canvas-transport-rpc
- feat/canvas-workbench-ui
- feat/canvas-node-adapters
- feat/canvas-capabilities
- feat/canvas-import-export
- feat/canvas-verification

Respect Module/Interface/Implementation separation:
- CanvasDocument is canonical truth.
- Renderer state is projection only.
- React Flow must stay behind CanvasRenderer Interface.
- Canvas mutations are the write path.
- Canvas storage is hybrid FS + SQLite/index.
- canvas:* RPC must enforce workspace/session access checks.

Parallel agents must not edit the same files without explicit coordination.
Contracts branch freezes types first. Other branches may scaffold against draft contracts, but final merge must pass gates in this spec.

No branch is done without tests/evidence matching its acceptance criteria.
```

## 29. First concrete implementation order

Even though work is parallel, the first concrete actions should be:

1. Create worktrees and branches.
2. Agent 1 freezes `CanvasDocument`, `CanvasNodeRef`, `CanvasMutation`, `CanvasCapability` contracts.
3. Agent 2 builds storage/index against contracts.
4. Agent 3 builds channels/RPC/RBAC against contracts.
5. Agent 7 builds JSON Canvas codec against contracts.
6. Agent 4 builds workbench UI against renderer projection and mocked RPC if needed.
7. Agent 5 builds node adapters against contracts and UI registry.
8. Agent 6 builds capability registry and selection actions.
9. Agent 8 verifies cross-branch integration and production gates.

## 30. Key risks and mitigations

### Risk: Renderer leakage

Problem:

React Flow shapes leak into domain/server/storage.

Mitigation:

- strict `CanvasRendererProjection` adapter;
- no React Flow imports in core/shared/server-core;
- tests/lint boundaries if available.

### Risk: Split state between local and remote

Problem:

Canvas channels marked local-only when they should be remote-eligible.

Mitigation:

- classify all persistence channels as remote-eligible;
- test routed client behavior;
- avoid UI-only state in persistence channels.

### Risk: Write storms

Problem:

Drag events emit too many patches.

Mitigation:

- local transient drag state;
- debounced patch batches;
- final position mutation on drag end;
- patch compaction/snapshots.

### Risk: RBAC bypass through refs

Problem:

User can see preview of linked session/artifact without permission.

Mitigation:

- resolve refs server-side or through checked API;
- use `requireSessionAccess` / `requireWorkspaceAccess` before preview;
- stale/unauthorized ref UI instead of leaked content.

### Risk: JSON Canvas data loss

Problem:

Rox-only fields cannot export to JSON Canvas.

Mitigation:

- namespaced metadata;
- import/export report;
- bundle export for lossless Rox state;
- JSON Canvas export as compatibility target, not backup format.

### Risk: Capability scope explosion

Problem:

Plugin-inspired capabilities grow without structure.

Mitigation:

- `CanvasCapabilityRegistry` from day one;
- each capability declares input/output/risk/availability;
- command palette filters by selection;
- risky capabilities require policy.

## 31. Final implementation stance

The final stance for engineering is:

```text
Build the complete production Canvas system in one coordinated slice.
Use parallel branches and agents for speed.
Use contracts and merge gates for safety.
Do not reduce scope to MVP.
Do not let UI renderer become domain truth.
Do not bypass storage/index/RBAC because the UI is urgent.
```

This document is the implementation contract for the production Canvas Workspace.
