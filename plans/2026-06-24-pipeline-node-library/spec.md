# Pipeline Node Library — Visual Workflow Builder (dify/sim.ai-class) — SPEC

**Status:** approved design (2026-06-24). First slice = node library + canvas + templates (design-time). Execution per node type = a later slice.

**Goal:** turn Rox Pipelines into a comprehensive visual workflow builder comparable to dify.ai / sim.ai / Flowise / LangFlow — a rich, data-driven library of typed, configurable nodes (Logic, AI, Data, Code, Input, Output, Tools), a beautiful canvas, an auto-generated inspector, and a templates gallery — available to every user (Pipelines is already a top-level feature, no flag gating).

**NOT in scope / explicit boundaries:**
- "Fusion" (RunFusion) is an external product; we do NOT copy its UI/code and do NOT depend on it. Visual language is inspired by dify/sim.ai natively.
- We do NOT port LangFlow/Flowise/dify code (Python/Node-server runtimes, license mismatch). We replicate the node *concepts* natively on Rox's `workflow-core` engine.
- "Programmable nodes" = **typed configurable nodes** (fields + wires). An arbitrary-code sandbox node ships its config now but its sandbox execution is a later slice.
- **Execution of NEW node types is a later slice.** This slice delivers: build, save, validate, beautiful render, palette, templates. The existing 5 types (`start`, `agent_run`, `loop`, `human_approval`, `response`) keep executing as today.

## Approach (chosen)

Data-driven node-type **registry** on the existing `workflow-core` engine. Each node type is a declarative module; the canvas, graph-adapter, NodeInspector, validator, and (later) the executor all read from the registry instead of hard-coding the 5 types. Adding a node type = adding one module. Reuses the editor, persistence (`workflow_definitions.draftState` jsonb), `validateGraph`, `pipeline.updateGraph`, and `run-pipeline` already in place.

## Architecture / data flow

```
NodeType registry (packages/workflow-core/src/registry/*)
  defines: id, category, label, icon, color, ports(in/out, typed), configSchema(zod), validate?, executor?(later)
        │
        ├──> Canvas palette (categorized, searchable, drag-n-drop)  ─┐
        ├──> Node render (icon/color/ports by registry)             ─┤ build graph
        ├──> NodeInspector auto-form (fields from configSchema)     ─┘
        ├──> validateGraph (registry-driven: required config, port type compat)
        │
        ▼
RoxWorkflowState.blocks[id] = { type:<registry id>, name, enabled, position, subBlocks:<config>, ports }
        │ persist via existing pipeline.updateGraph (jsonb; subBlocks already z.record(string,unknown))
        ▼
run-pipeline executor registry (LATER slice) dispatches block.type -> executor
```

`RoxBlockState.type` widens from a 5-member union to a registry-validated string (additive; jsonb, **no DB migration** — `workflowBlockSchema.subBlocks` is already `z.record(z.string(), z.unknown())`).

## Components (units, each small + testable)

1. **`workflow-core/src/registry/`** — `NodeTypeDefinition` interface + `registerNodeType` + `getNodeType`/`listNodeTypes`/`listByCategory` + a category enum. Pure, db-free, unit-tested.
2. **Node-type modules** — one file per type under `registry/nodes/<category>/<type>.ts`, each exporting a `NodeTypeDefinition` (configSchema = zod, inspector field hints, render meta, validate). Registered in a single `registry/index.ts` barrel.
3. **`validateGraph`** — generalized to drive required-config + port-type checks from the registry (keep existing graph-level checks: start integrity, unreachable, etc.).
4. **Web `PipelineEditor`** — generalize:
   - `graph-adapter.ts` round-trips arbitrary registry types (already mostly generic).
   - `NodeInspector` renders an **auto-form** from the selected node's `configSchema` (field renderers: text, number(min/max), select(model/agent/role/knowledge-base/db), textarea, key-value, expression, boolean) — replaces the per-type hand-forms (keep behavior for the 5 existing types).
   - `PipelineCanvas` palette: categorized, searchable, drag-n-drop add (replaces the 4 fixed toolbar buttons); node render shows category icon/color + typed ports; edges labeled/colored (success/failure/condition branches); node groups; minimap/zoom.
5. **Desktop `PipelineEditor`** — mirror the web generalization (parity).
6. **Templates** — `templates.ts` expands to a declarative gallery (many: RAG bot, tool-using agent, classifier-router, ETL, review-with-gate, etc.) + an "insert template" gallery UI on the canvas.

## Node catalog (slice 1 — design-time: palette + config + render + validate; executor deferred)

- **Input/Trigger:** `start`*, `manual_input`, `webhook`, `schedule`.
- **AI:** `model` (LLM call: model select + system/user prompt + temperature/maxTokens), `agent_run`*, `knowledge_retrieval` (RAG: knowledge-base select + top-k), `embedding`, `classifier`, `structured_extract`.
- **Logic:** `condition` (if/else), `switch` (branch by value/result), `loop`*, `merge`, `gate`/`route`, `human_approval`*.
- **Data:** `http_request`, `db_query` (SQL), `transform` (template/map), `variable_set`, `parser`.
- **Code:** `code` (config now; sandbox execution later).
- **Output:** `response`*, `notify`, `db_write`.
- **Tools:** `tool_call`, `mcp_tool`, `web_search`.

(* = already exists; migrate into a registry module, behavior preserved + already executes.)

## Execution (LATER slice — documented, not built now)

`workflow-core` gains an executor registry keyed by node type; `run-pipeline` dispatches `block.type -> executor`. Per-type executors land incrementally (Model→LLM call, Condition→branch, RAG→retrieval, HTTP/DB→request, Code→sandbox). Until a type has an executor, the runtime treats it as a no-op/pass-through with a clear "not yet executable" surface (never a silent wrong result).

## Testing

TDD per unit: registry register/get/list; each node module's configSchema validates expected config; `validateGraph` required-config + port-type compat; the inspector auto-form renders the right fields per type (SSR render assertions, repo pattern); graph-adapter round-trips registry types; templates parse to valid graphs. Existing 5-type tests stay green. `bun run lint` exit 0; `turbo typecheck` for touched packages exit 0.

## Boundaries / safety

- Additive/backward-compatible: widening `type` to a registry string keeps old graphs valid; no DB migration (jsonb).
- The 5 existing types keep working end-to-end.
- Available to all users (no experimental flag — Pipelines is top-level).
- Web + desktop parity for the editor.

## Build slices (this spec = Slice 1)

- **1a Foundation:** registry + generalize types/validate/graph-adapter/NodeInspector(auto-form)/canvas-palette; migrate the 5 existing types into registry modules; keep green.
- **1b Catalog:** the node-type modules above (design-time) by category.
- **1c Canvas+Templates:** beautiful render (icons/colors/typed ports/labeled-colored edges/groups), categorized searchable drag palette, templates gallery (many) + insert UI; desktop parity.
- **Slice 2 (separate):** per-type execution registry + Code sandbox.
