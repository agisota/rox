# Pipeline Node Catalog — Completeness Audit vs dify / sim / Flowise / LangFlow

**Status:** audit (2026-06-25), gap-аудит ПОВЕРХ wave3 #517 — closes #554.
**Companion to:** [`spec.md`](./spec.md) (approved design, 2026-06-24).
**Scope:** documentation only. Node facts below are derived from the actual
`packages/workflow-core/src/blocks/coreBlocks.ts` registry and the runtime
handler map in `packages/trpc/src/router/pipeline/handlers.ts` +
`packages/workflow-runtime/src/executor/WorkflowExecutor.ts`. No invented nodes.

This document records the delta of the Rox node catalog against the four
reference visual-workflow builders (dify, sim, Flowise, LangFlow) so that
slice-2+ closes real gaps rather than assumptions.

---

## 1. Implemented executable node catalog (source of truth)

The runtime understands **29** built-in block definitions, registered in
`coreBlocks.ts`. Skill calls are dynamic (`skill_call:<slug>`) and registered
separately. Verbatim list:

```
start, response, condition, switch, merge, gate, route, loop, parallel, wait,
delay, human_approval, skill_call, agent_run, model, http_request, transform,
parser, variable_set, knowledge_retrieval, db_query, db_write, tool_call,
mcp_tool, web_search, embedding, classifier, structured_extract, error_boundary
```

### Executable status taxonomy

Three execution seams exist (see `WorkflowExecutor.ts` + `handlers.ts`):

- **structural** — interpreted directly by the graph walk in the executor
  (entry/terminal/loop/pause/error-catch); no injected handler needed.
- **resolver-seam** — `agent_run` and `skill_call` run on dedicated resolver
  seams, NOT via the handler map.
- **handler** — registered in `buildPipelineHandlers(scope?)`. Either always
  registered, or **scope-gated** (tenant-bounded ports only wired when the run
  carries an org/project `scope`; otherwise the node falls back to pass-through).
- **pass-through** — any `block.type` with no registered handler is executed as
  `(ctx) => ({ output: ctx.input })` (echoes its input). This is the documented
  follow-up surface, never a silent wrong result.

| # | Node | Category | Ports (in → out) | Executable now? | Notes |
|---|------|----------|------------------|-----------------|-------|
| 1 | `start` | Input/Trigger | — → `out` | ✅ structural | Workflow entry point. |
| 2 | `response` | Output | `in` → — | ✅ structural | Terminal; sets `runOutput`. |
| 3 | `condition` | Logic | `in` → `true`,`false` | ✅ handler | Boolean expr branch (pure). |
| 4 | `switch` | Logic | `in` → `default` | ✅ handler | Matched-case branch (pure). |
| 5 | `merge` | Logic | `in` → `out` | ✅ handler | Joins branches into one object. |
| 6 | `gate` | Logic | `in` → `default` | ✅ handler | Predicate route (1-of-N). |
| 7 | `route` | Logic | `in` → `default` | ✅ handler | Alias of gate handler. |
| 8 | `loop` | Logic | `in` → `out` | ✅ structural | Bounded re-entrant loop walk. |
| 9 | `parallel` | Logic | `in` → `out` | ⚠️ structural/partial | Concurrent join is graph-driven; no dedicated handler — pass-through if not graph-joined. |
| 10 | `wait` | Logic/IO | `in` → `out` | ⚠️ pass-through | External-event wait; no handler yet — design-time. |
| 11 | `delay` | Logic/IO | `in` → `out` | ⚠️ pass-through | Fixed-duration wait; no handler yet — design-time. |
| 12 | `human_approval` | Logic | `in` → `approved`,`rejected` | ✅ structural | Pauses run (`pausesRun`). |
| 13 | `skill_call` | Tools | `in` → `out` | ✅ resolver-seam | Invokes a published skill as a child run. |
| 14 | `agent_run` | AI | `in` → `out`,`error` | ✅ resolver-seam | Runs an agent role (chat/CLI worktree). |
| 15 | `model` | AI | `in` → `out`,`error` | ✅ handler | Single LLM call (system+user). |
| 16 | `http_request` | Data | `in` → `out`,`error` | ✅ handler | HTTP(S) w/ SSRF protection (#543). |
| 17 | `transform` | Data | `in` → `out`,`error` | ✅ handler | Template / field-map (pure). |
| 18 | `parser` | Data | `in` → `out`,`error` | ✅ handler | JSON/CSV/regex parse. |
| 19 | `variable_set` | Data | `in` → `out`,`error` | ✅ handler | Writes named ctx value. |
| 20 | `knowledge_retrieval` | AI/RAG | `in` → `out`,`error` | 🔒 handler (scope-gated) | RAG top-K; pass-through w/o tenancy scope. |
| 21 | `db_query` | Data | `in` → `out`,`error` | 🔒 handler (scope-gated) | Read-only SELECT; org-scoped. |
| 22 | `db_write` | Output/Data | `in` → `out`,`error` | 🔒 handler (scope-gated) | INSERT/UPDATE/DELETE in txn; org-scoped. |
| 23 | `tool_call` | Tools | `in` → `out`,`error` | ⚠️ pass-through | Pure handler + tests exist (`makeToolCallHandler`), NOT wired — needs `McpContext` (bearer/userId/requestId) the run scope lacks (#545). |
| 24 | `mcp_tool` | Tools | `in` → `out`,`error` | ⚠️ pass-through | Same as tool_call — `makeMcpToolHandler` exists but un-wired pending MCP-context seam (#545). |
| 25 | `web_search` | Tools | `in` → `out`,`error` | ✅ handler | Provider-abstraction; self-reports `WEB_SEARCH_NOT_CONFIGURED` (#545). |
| 26 | `embedding` | AI | `in` → `out`,`error` | ✅ handler | OpenAI `text-embedding-3-small`; routes to `error` if unconfigured (#548). |
| 27 | `classifier` | AI | `in` → `out`,`error` | ✅ handler | Zero-shot LLM classify + route by class (#548). |
| 28 | `structured_extract` | AI | `in` → `out`,`error` | ✅ handler | Forced-JSON LLM, schema-validated (#548). |
| 29 | `error_boundary` | Logic | `in` → `ok`,`error` | ✅ structural | Catches errors from a wrapped sub-graph. |

**Summary:** 21 fully executable now (handler or structural or resolver-seam) +
3 scope-gated (executable in a real tenant run) + 5 design-time/pass-through
follow-ups (`parallel` partial, `wait`, `delay`, `tool_call`, `mcp_tool`).

---

## 2. Category coverage vs reference builders

Conceptual mapping only — per spec §Boundaries we do **NOT** port
dify/sim/Flowise/LangFlow code or their Python/Node-server runtimes (license +
architecture mismatch). We replicate node *concepts* natively on
`workflow-core`.

Legend: **parity** = a concept-equivalent node ships & executes; **gap** = not
yet implemented or partial; **n/a** = deliberately out of scope.

| Category | dify | sim | Flowise | LangFlow | Rox status | Rox node(s) |
|----------|------|-----|---------|----------|------------|-------------|
| LLM call | ✔ LLM | ✔ Agent/LLM | ✔ LLMChain | ✔ LLM/Model | **parity** | `model`, `agent_run` |
| Logic / branch | ✔ IF/ELSE, Question Classifier | ✔ Condition/Router | ✔ IfElse | ✔ Conditional Router | **parity** | `condition`, `switch`, `gate`, `route`, `merge`, `loop`, `error_boundary` |
| RAG / retrieval | ✔ Knowledge Retrieval | ✔ Knowledge | ✔ Retriever/VectorStore | ✔ Retriever | **parity (scope-gated)** | `knowledge_retrieval` |
| HTTP | ✔ HTTP Request | ✔ API/HTTP | ✔ CustomTool(http) | ✔ API Request | **parity** | `http_request` |
| DB / SQL | ✔ (via tool) | ✔ Postgres/SQL | ✔ SQL/Vector DBs | ✔ SQL/DB | **parity (scope-gated)** | `db_query`, `db_write` |
| Tools / function-call | ✔ Tools | ✔ Tools | ✔ Tools/Custom Tool | ✔ Tool/Toolkit | **partial gap** | `tool_call`, `mcp_tool` (pass-through), `web_search` (✅) |
| Data transform | ✔ Template/Code/Var Aggregator | ✔ Function/Transform | ✔ Custom Function | ✔ Data/ParseData | **parity** | `transform`, `parser`, `variable_set` |
| AI-secondary (classify/extract/embed) | ✔ Classifier, Param Extractor | ✔ Embeddings | ✔ Embeddings, Output Parser | ✔ Embeddings, Structured Output | **parity** | `classifier`, `structured_extract`, `embedding` |
| Code sandbox | ✔ Code | ✔ Code | ✔ Custom Function (JS) | ✔ Python node | **gap (n/a runtime)** | none — `code` not registered; sandbox is a later slice, Python/JS arbitrary runtime out of scope |
| IO / trigger | ✔ Start, Webhook, Schedule | ✔ Start/Trigger/Webhook/Schedule | ✔ (server triggers) | ✔ Chat Input/Output | **partial gap** | `start` (✅); `manual_input`, `webhook`, `schedule`, `notify` not in registry (trigger-layer) |
| Human-in-the-loop | ✔ (some) | ✔ Human approval | ➖ | ➖ | **parity (Rox-ahead)** | `human_approval` |
| Pause / wait | ✔ | ✔ | ➖ | ➖ | **partial gap** | `wait`, `delay` (registered, pass-through) |

---

## 3. Gap checklist (prioritized backlog)

Each gap = a follow-up area, an existing executor-issue, or a deliberate
scope-out. No duplicates with already-filed executor-issues.

### P1 — real ports for nodes that already render & validate

- [ ] **`tool_call` real port** — wire `makeToolCallHandler` into the run.
      Blocker: needs an `McpContext` (bearer/userId/requestId) that the run
      `scope` does not carry. Follow-up: `run-pipeline` MCP-context seam. (#545)
- [ ] **`mcp_tool` real port** — same MCP-context seam as `tool_call`;
      `makeMcpToolHandler` exists + fake-port tested, un-wired. (#545)
- [ ] **Typed ports / port-type compatibility** — formalize typed wires so the
      validator can enforce port-type compat across the catalog. (#549)

### P2 — execution depth for design-time nodes

- [ ] **`embedding` → vector store** — `embedding` produces a vector but there
      is no vector-store write/upsert node to persist it (RAG ingest half).
      Needs a `vector_upsert`/store node or a `db_write`-to-pgvector path.
- [ ] **`wait` / `delay` executors** — currently registered & pass-through;
      need real timer / external-event resume seams.
- [ ] **`parallel` join executor** — concurrent fan-out/join is graph-driven;
      confirm/finish a dedicated handler so it never silently passes through.
- [ ] **sim-parity sweep** — close residual node-level differences vs sim.ai
      catalog (router/agent/trigger nuances). (#594)

### P3 — catalog breadth & UX surfacing

- [ ] **Trigger-layer nodes** — `manual_input`, `webhook`, `schedule`, `notify`
      from spec §catalog are not yet registered as block-definitions; they live
      at the trigger layer and need design-time registry modules + executors.
- [ ] **`code` sandbox node** — config-only per spec; arbitrary-code sandbox
      execution is an explicit later slice. Porting LangFlow/Flowise Python/JS
      runtimes is **out of scope (n/a)** per spec §Boundaries (license/arch).
- [ ] **Data-passing UI picker** — upstream-output picker so users wire typed
      fields between nodes (depends on typed ports #549).
- [ ] **Trace drill-in UI** — per-node run inspection / step drill-in surface.
- [ ] **Templates gallery breadth** — expand declarative templates (RAG bot,
      tool-using agent, classifier-router, ETL, review-with-gate). (#551)

### Deliberate scope-outs (n/a)

- Porting dify/sim/Flowise/LangFlow source, UI, or Python/Node-server runtimes
  (license + architecture mismatch) — spec §Boundaries.
- RunFusion ("Fusion") dependency or UI copy — external product, not depended on.
- Arbitrary-code sandbox runtime as a generic Python/JS host — concept replicated
  natively only (typed configurable nodes), not as a foreign runtime.

---

## 4. Acceptance trace (against #554)

- [x] Table covers ≥4 references (dify/sim/Flowise/LangFlow) × categories — §2.
- [x] Grouped by spec categories (Input/AI/Logic/Data/Code/Output/Tools) — §1/§2.
- [x] Each gap tagged: child-issue (#545/#549/#594/#551) / new follow-up / scope-out — §3.
- [x] Prioritized P1/P2/P3 backlog with issue links — §3.
- [x] Recorded as a doc (not code) under `plans/2026-06-24-pipeline-node-library/`.
- [x] No duplicates with filed executor-issues; links provided.

**Node list verification:** the 29-node list in §1 matches verbatim
`grep -oE 'defineBlock\("[a-z_]+"' packages/workflow-core/src/blocks/coreBlocks.ts`.
