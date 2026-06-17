# Rox Agent Pipeline Automations — Implementation Spec

Status: design (buildable). Branch: `feat/agent-pipelines`. Author pass: design.
Last updated: 2026-06-17.

> INTEGRITY RULE (non-negotiable): every build stage MUST end compiling and
> typecheck-clean for the packages it touches. Where a full implementation is
> too large for a stage, scaffold with `// TODO(agent-pipelines):` markers but
> keep everything compiling + Biome-clean. Never leave the branch broken.

---

## 0. BLUF

Rox already ships an **Automation Fabric** (graph workflows + skills + runs)
and a **working cron→agent dispatcher** (`automations` → `dispatchAutomation`).
We do **not** greenfield. We add an **event-driven pipeline layer** on top:

- A **pipeline** is a project-scoped `workflow_definitions` row whose graph nodes
  are mostly `agent_run` blocks (chat agents in-process, or CLI agents in
  git-worktrees), wired by edges, with optional loops and approval gates.
- A node fires when one of **6 triggers** matches an event. A new **trigger
  registry** + **dispatcher** is the only genuinely new subsystem; everything
  else extends existing tables, the executor, and the run service.
- **Roles** are saved **preset bundles** (system prompt + model + skills +
  settings) modeled as `skills(kind="agent")` versions. 4 built-ins ship:
  `prompt-improver`, `decomposer`, `orchestrator`, `critic`.
- Inter-node data is the **message + accumulating context** (each agent output is
  appended; downstream agents see the full transcript).
- Config lives in **Postgres** (Electric-synced to web + desktop, canvas in
  both). **Execution runs on the desktop host-service**, where agents actually
  run, driven by the same `runSkill` path that exists today.

Reuse map (extend, do not duplicate):

| Need | Existing anchor | Action |
|---|---|---|
| Pipeline definition | `workflow_definitions` (`workflow.ts:114`), `RoxWorkflowState` (`types.ts:68`) | reuse; add `pipeline` engine tag + `agent_run` block type |
| Node-as-agent | `skills(kind="agent")` (`enums.ts:165`), `skill_versions` (`workflow.ts:305`) | reuse for roles; add agent-config payload |
| Run records | `workflow_runs` (`workflow.ts:446`) + `workflow_run_steps:519` | reuse; widen `triggerKind`; add accumulating-context column |
| Approval gate | `human_approval` block + `approval_requests:686` | reuse as-is |
| Loops | `RoxLoop.maxIterations` (`types.ts:54`) | reuse; executor honors cap |
| Agent launch | host `runAgentInWorkspace` (`agents.ts:277`) | reuse via dispatch primitive |
| Dispatch primitive | `dispatchAutomation` (`dispatch.ts:42`) | emulate (mint JWT → workspace → relay `agents.run`) |
| Event signals | host event-bus (`event-bus.ts:66`), chat lifecycle (`runtime.ts:181`) | tap into; emit pipeline events |
| Canvas | `@xyflow/react` 12.10.2 + `ai-elements/canvas.tsx` (UNUSED) | wire up |

---

## 1. Concept & execution model

### 1.1 Graph / DAG choreography (not a linear chain)

A pipeline is a directed graph. Each node declares its **trigger** (what makes
it fire) instead of being position-N in a chain. The executor already does
**topological linearization with branch pruning + join semantics**
(`WorkflowExecutor.ts:41`): a block runs only when a live upstream edge fires,
and join nodes wait for every live input. That is exactly DAG choreography
expressed as a deterministic plan, so we keep the executor as the in-run engine
and add the **cross-run trigger dispatcher** for events that are not edges
(e.g. `user_sent_message`, `project_initialized`, `service_connected`).

Two layers, clean seam:

```
                EVENT  (user msg / agent finished / file created / ...)
                  │
                  ▼
        ┌─────────────────────────┐
        │  Trigger Registry +      │   NEW  (pipeline-events package +
        │  Dispatcher (cross-run)  │        trpc router + host emitters)
        └───────────┬─────────────┘
                    │ resolves to a pipeline node → runSkill(...)
                    ▼
        ┌─────────────────────────┐
        │  runSkill (run-service)  │   EXTEND  (widen triggerKind; pass ctx)
        └───────────┬─────────────┘
                    │
                    ▼
        ┌─────────────────────────┐
        │  WorkflowExecutor        │   EXTEND  (+ agent_run handler,
        │  (in-run DAG engine)     │            + loop cap, reuse approval)
        └───────────┬─────────────┘
                    │ agent_run → host dispatch (chat OR CLI)
                    ▼
        ┌─────────────────────────┐
        │  host runAgentInWorkspace│   REUSE  (chat in-proc | terminal CLI)
        └─────────────────────────┘
```

### 1.2 Trigger taxonomy → existing enum

`triggerKindValues` (`enums.ts:228`) ALREADY lists every signal we need but
**nothing emits or matches them**. We map the 6 product triggers onto the
existing enum (no new enum values required for the 6; we only need them wired):

| Product trigger | Enum value (exists) | Concrete signal source |
|---|---|---|
| `user_sent_message` | `chat` | chat send mutation in `packages/chat` runtime (`chat.ts`) |
| `agent_run_finished` | `agent_run_finished` | executor `agent_run` step completion + host `agent:lifecycle` Stop (`event-bus.ts:165`, `runtime.ts:240`) |
| `all_prior_agents_finished` (barrier) | (in-run) — no enum value; it is a **join node**, not a cross-run trigger | executor join semantics on `agent_run` nodes (already native) |
| `project_initialized` | `task_created`-style → add `project_initialized` value | `v2Project` create in `v2-project` router |
| `file_or_artifact_created` | `file_uploaded` | artifact insert in `run-service` + host fs/git watch (`event-bus.ts`) |
| `service_or_skill_connected` | `repo_connected` (rename-compatible) → add `service_connected` value | integration/skill-binding create (`integration` router, `skill.bind`) |

Enum delta (additive, safe): add `project_initialized` and `service_connected`
to `triggerKindValues`. The other four reuse existing values. `barrier` is NOT
a trigger value — it is a graph join and needs no enum entry.

---

## 2. Data-model deltas

All deltas extend `packages/db/src/schema`. Migrations are authored with
`cd /Users/marklindgreen/Projects/set-for-projects/set && bunx drizzle-kit generate --name <snake>`
(offline; NEVER `migrate`/`push`; NEVER hand-edit `packages/db/drizzle/`).

### 2.1 A pipeline IS a `workflow_definition` (no new table)

- Reuse `workflow_definitions` (`workflow.ts:114`) — already `v2ProjectId`-scoped,
  org-scoped, owner-scoped, with `draftState: RoxWorkflowState` jsonb + version
  lifecycle (`workflow_versions:163` → `workflow_deployments:205`).
- **Delta:** extend `workflowEngineValues` (`enums.ts`) with `"pipeline"` so the
  UI/dispatcher can filter pipelines from plain workflows. Default stays `rox`.
  `engine` already exists on the row; only the enum value is new.
- No structural change to `RoxWorkflowState` — pipeline-ness is carried by
  `engine="pipeline"` + the presence of `agent_run` blocks.

### 2.2 Agent-role presets = `skills(kind="agent")` (reuse `agent` kind)

`skill_kind` already includes `"agent"` (`enums.ts:165`). A **role** is a
`skills` row with `kind="agent"` plus a `skill_versions` row carrying the preset
bundle. We store the bundle in the **existing `externalToolRef` jsonb** column on
`skill_versions` (one of the mutually-exclusive impl refs) under a typed shape,
OR — cleaner — add one nullable jsonb column:

- **Delta (preferred):** add `skill_versions.agentConfig` jsonb
  `$type<AgentRolePreset>()` (nullable). Set iff `skill.kind="agent"`.
  Extend the service-layer "exactly one impl ref" check (`helpers.ts`
  `assertExactlyOneImplementationRef`) to treat `agentConfig` as the impl ref
  for `kind="agent"`.

```ts
// packages/workflow-core/src/agents/agentRolePreset.ts (NEW, pure)
export interface AgentRolePreset {
  agentKind: "chat" | "terminal";        // rox in-proc | CLI in worktree
  agentId: string;                        // ROX_AGENT_ID | "claude" | "codex" ...
  model?: string;                         // chat-models id; default ROX R1
  systemPrompt: string;                   // role persona (RU-friendly)
  skillSlugs: string[];                   // skills granted to this role
  settings: AgentRoleSettings;            // maxTurns, temperature, mcpScope...
}
export interface AgentRoleSettings {
  maxTurns?: number;
  temperature?: number;
  mcpScope?: string[];
  worktreeBranchPrefix?: string;          // CLI agents only
}
```

### 2.3 Trigger registry (NEW table) + pipeline runs (reuse `workflow_runs`)

`workflow_runs` (`workflow.ts:446`) already has `triggerKind` + `triggerRef` +
`parentRunId` + `v2ProjectId` + `skillId/skillVersionId`. We reuse it verbatim
for pipeline runs. Two deltas:

1. **Accumulating context column.** Add `workflow_runs.accumulatedContext` jsonb
   `$type<AccumulatedContext>()` (nullable; see §5). Holds the running
   transcript fed to downstream agent nodes. Step-level message rows already
   live in `workflow_run_steps.output`.

2. **NEW table `pipeline_triggers`** — the registry that maps an event class to a
   pipeline node. This is the one genuinely new persistence object.

```ts
// packages/db/src/schema/pipeline.ts (NEW)
export const pipelineTriggerKind = pgEnum(             // reuse triggerKind enum
  "trigger_kind", triggerKindValues);                  // (already exists)

export const pipelineTriggers = pgTable("pipeline_triggers", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  v2ProjectId: uuid("v2_project_id")
    .references(() => v2Projects.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").notNull()            // the pipeline
    .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  /** The RoxBlockState id within the pipeline graph this trigger fires. */
  nodeId: text("node_id").notNull(),
  triggerKind: triggerKind("trigger_kind").notNull(),  // reuse enum
  /** Match predicate (eventType-specific): repo id, skill slug, glob, etc. */
  matchConfig: jsonb("match_config").$type<TriggerMatchConfig>().notNull().default({}),
  enabled: boolean().notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pipeline_triggers_match_idx").on(t.triggerKind, t.enabled),
  index("pipeline_triggers_project_idx").on(t.v2ProjectId),
  index("pipeline_triggers_workflow_idx").on(t.workflowId),
]);
```

`TriggerMatchConfig` is a pure type in `@rox/workflow-core` (see §4).

3. **Object-graph edges:** reuse `object_relations` (`workflow.ts:646`) for
   `pipeline produced_run run`, `run triggered_run run` (loop/feedback), and
   `trigger fired_node run`. No schema change — it is generic typed edges.

### 2.4 Enum deltas summary (one migration)

- `workflowEngineValues` += `"pipeline"`.
- `triggerKindValues` += `"project_initialized"`, `"service_connected"`.
- `objectTypeValues` already has `workflow`/`skill`/`run`; add `"pipeline_trigger"`
  for object-graph edges.

New columns: `skill_versions.agentConfig`, `workflow_runs.accumulatedContext`.
New table: `pipeline_triggers`. Run once:
`bunx drizzle-kit generate --name agent_pipelines`.

---

## 3. `agent_run` block + WorkflowExecutor handler

### 3.1 Block type registration (pure layer)

- **Delta:** add `"agent_run"` to `CoreBlockType` (`types.ts:12`) and a
  `defineBlock("agent_run", ...)` entry in `coreBlocks.ts:7` with inputs
  `[{name:"in"}]`, outputs `[{name:"out"},{name:"error"}]`, `risk:"high"`.
- A node's role is referenced from `RoxBlockState.subBlocks`:

```ts
// subBlocks shape for an agent_run node (validated in workflow-core/schema)
{
  roleSkillSlug: string;          // skills(kind="agent").slug → AgentRolePreset
  promptTemplate?: string;        // overrides/extends role.systemPrompt per node
  loopRole?: "improver" | "critic" | null;  // hint for feedback loops
}
```

`agent_run` is deliberately NOT a `skill_call:<slug>` — skill calls spawn a
nested *workflow* child run; an `agent_run` spawns a *chat/CLI agent execution*.
Both are first-class but distinct executor branches.

### 3.2 Executor handler design

`WorkflowExecutor` (`WorkflowExecutor.ts:41`) currently has only `start`/`response`
built-ins plus the `human_approval` and `skill_call` special branches. We add a
third special branch for `agent_run`, fed by an **injected port** (mirrors
`resolveSkillCall`, keeps the executor DB-free + host-free):

```ts
// packages/workflow-runtime/src/executor/types.ts (EXTEND ExecuteOptions)
export interface AgentRunRequest {
  blockId: string;
  roleSkillSlug: string;
  promptTemplate?: string;
  /** message + accumulating context the node receives (see §5). */
  context: AccumulatedContext;
}
export interface AgentRunResultPort {
  output?: Record<string, unknown>;   // { message, artifacts? }
  appendedContext?: ContextEntry[];   // what to append downstream
  childRunRef?: { kind: "chat" | "terminal"; sessionId: string };
  error?: WorkflowRunError;
}
export type AgentRunResolver = (
  req: AgentRunRequest,
) => Promise<AgentRunResultPort>;

export interface ExecuteOptions {
  /* ...existing... */
  resolveAgentRun?: AgentRunResolver;   // NEW
  /** carries the run's accumulating context across nodes. */
  initialContext?: AccumulatedContext;  // NEW
}
```

Executor loop delta (insert before the generic-handler branch, after the
`skill_call` branch at `WorkflowExecutor.ts:162`):

```ts
if (block.type === "agent_run") {
  if (!options.resolveAgentRun) { /* record failed NO_AGENT_RESOLVER; return */ }
  const req: AgentRunRequest = {
    blockId,
    roleSkillSlug: String(block.subBlocks?.roleSkillSlug ?? ""),
    promptTemplate: block.subBlocks?.promptTemplate as string | undefined,
    context: mergeContext(runContext, input),   // message + accumulation
  };
  const res = await options.resolveAgentRun(req);
  if (res.error) { /* honor errorMode like skill_call; record; maybe continue */ }
  // ACCUMULATE: append this node's output so later nodes see the transcript.
  if (res.appendedContext) runContext.entries.push(...res.appendedContext);
  outputs.set(blockId, res.output ?? {});
  await record({ blockId, blockType: block.type, status: "succeeded",
                 input, output: res.output, childRunId: res.childRunRef?.sessionId });
  continue;
}
```

`runContext` is seeded from `options.initialContext` at the top of `execute()`
and threaded into every `agent_run` node (this is the accumulation in §5). The
generic/condition/parallel/loop branches stay untouched.

### 3.3 The resolver implementation (run-service → host dispatch)

`run-service.ts:146` `runSkill` already wires `resolveSkillCall`. We inject a
sibling `resolveAgentRun` that:

1. loads the role skill (`skills(kind="agent")` + version `agentConfig`),
2. picks chat vs CLI from `agentConfig.agentKind`,
3. dispatches via the **same primitive as `dispatchAutomation`** (`dispatch.ts:42`):
   mint scoped JWT (`mintUserJwt`), reuse-or-create a workspace, relay
   `agents.run` to the host (`agents.ts:277` `runAgentInWorkspace`),
4. for **chat agents** (`ROX_AGENT_ID`): run in-process via the host chat runtime
   (`chat.ts`), capturing the assistant message as the node output,
5. for **CLI agents** (`claude`/`codex`): launch a terminal session in a
   git-worktree workspace; completion is observed via `agent:lifecycle` Stop
   (`event-bus.ts:165` + `runtime.ts:240`), and the final message/diff is read
   back as the node output,
6. returns `{ output:{message,artifacts}, appendedContext:[{role,agentId,message}] }`.

```ts
// packages/trpc/src/router/pipeline/agent-run-service.ts (NEW)
export function makeAgentRunResolver(args: {
  organizationId: string; userId: string; v2ProjectId: string | null;
  relayUrl: string; runId: string;
}): AgentRunResolver { /* TODO(agent-pipelines): chat in-proc; CLI via relay */ }
```

`MAX_SKILL_CALL_DEPTH=5` (`run-service.ts:29`) gets a sibling
`MAX_AGENT_RUN_DEPTH` to bound recursive agent fan-out. The `triggerKind` union
(`run-service.ts:36`) widens to include the event kinds (see §2.4).

---

## 4. Trigger registry table + event→dispatcher (all 6)

### 4.1 Pure types (`@rox/workflow-core`)

```ts
// packages/workflow-core/src/triggers/triggerMatch.ts (NEW, pure)
export type PipelineTriggerEventKind =
  | "user_sent_message" | "agent_run_finished" | "project_initialized"
  | "file_or_artifact_created" | "service_or_skill_connected";
// note: all_prior_agents_finished is an in-graph JOIN, not an event kind.

export interface TriggerMatchConfig {
  /** chat: restrict to a chat session / project. */
  chatSessionId?: string;
  /** agent_run_finished: only fire for these upstream node ids / roles. */
  afterNodeIds?: string[];
  /** file_or_artifact_created: glob or artifact kind. */
  pathGlob?: string; artifactKind?: string;
  /** service_or_skill_connected: skill slug / integration id. */
  skillSlug?: string; integrationId?: string;
}

export interface PipelineEvent {
  kind: PipelineTriggerEventKind;
  organizationId: string;
  v2ProjectId?: string | null;
  payload: Record<string, unknown>;     // event-specific
}

/** Pure predicate: does this registry row match this event? */
export function triggerMatches(
  cfg: TriggerMatchConfig, kind: PipelineTriggerEventKind,
  event: PipelineEvent,
): boolean { /* deterministic, unit-tested */ }
```

### 4.2 Dispatcher (server, in trpc)

```ts
// packages/trpc/src/router/pipeline/dispatcher.ts (NEW)
export async function dispatchPipelineEvent(event: PipelineEvent): Promise<void> {
  // 1. SELECT pipeline_triggers WHERE triggerKind=mapEnum(event.kind)
  //    AND enabled AND (v2ProjectId = event.project OR NULL) AND org match.
  // 2. filter rows with triggerMatches(row.matchConfig, event.kind, event).
  // 3. for each match → start that pipeline node as a run:
  //      runPipelineNode({ workflowId, nodeId, triggerKind, triggerRef: event })
  //    which calls runSkill-equivalent with the pipeline deployment + entry node.
}
```

### 4.3 Signal sources → emitter call sites (the wiring)

There is **no general dispatcher yet — we build it**, and we add emit calls at
each concrete source. Every emitter is a one-line `dispatchPipelineEvent(...)`
(fire-and-forget, never blocks the user path):

| Event | Emit at | File anchor |
|---|---|---|
| `user_sent_message` | chat send mutation, after persisting user msg | `packages/chat/src/server/trpc/.../runtime.ts` (Start lifecycle / send) |
| `agent_run_finished` | (a) executor records `agent_run` succeeded → resolver emits; (b) host `agent:lifecycle` Stop | `WorkflowExecutor.ts` agent_run branch + `event-bus.ts:165` |
| `all_prior_agents_finished` | NOT emitted — native executor join on the node's incoming edges | `WorkflowExecutor.ts:100` (`liveEdges`/join) |
| `project_initialized` | `v2Project.create` mutation success | `packages/trpc/src/router/v2-project/*` |
| `file_or_artifact_created` | (a) `artifacts` insert in run-service; (b) host fs/git watch | `run-service.ts` artifact insert + `event-bus.ts` git/fs |
| `service_or_skill_connected` | `integration` connect + `skill.bind` mutation | `integration` router + `skill.ts:386` `bind` |

Desktop is the execution host, so the host-service event-bus (`/events` WS,
`app.ts:194`) re-broadcasts pipeline lifecycle to the renderer; web observes the
same runs via Electric sync of `workflow_runs`/`workflow_run_steps`
(`apps/electric-proxy`). `trpc-electron` subscriptions remain observable-only.

### 4.4 Barrier (`all_prior_agents_finished`)

Implemented purely as graph topology: an `agent_run` (or `response`) node whose
incoming edges come from N upstream `agent_run` nodes is a **join**. The executor
already waits for every live input before running a join (`WorkflowExecutor.ts:100`
+ `validateGraph` topo order). No registry row, no enum value — the canvas just
draws N→1 edges and the executor enforces the barrier.

---

## 5. Message + accumulating context contract

```ts
// packages/workflow-core/src/context/accumulatedContext.ts (NEW, pure)
export interface ContextEntry {
  nodeId: string;
  role: string;                 // role skill slug, e.g. "critic"
  agentId: string;              // ROX_AGENT_ID | "claude" ...
  message: string;              // the agent's output text
  artifacts?: { kind: string; ref: string }[];
  at: string;                   // ISO timestamp
}
export interface AccumulatedContext {
  /** The originating user/system message that seeded the pipeline. */
  seedMessage: string;
  /** Append-only transcript; later nodes see all prior entries. */
  entries: ContextEntry[];
}
export function renderContextForPrompt(ctx: AccumulatedContext): string {
  // deterministic transcript rendering injected into each agent's prompt
}
```

Contract:

- The pipeline run is created with `accumulatedContext = { seedMessage, entries: [] }`
  (persisted on `workflow_runs.accumulatedContext`, §2.3).
- Before each `agent_run`, the resolver renders `seedMessage + entries` (via
  `renderContextForPrompt`) into the agent prompt (prepended to the node's
  `promptTemplate`/role `systemPrompt`).
- After each `agent_run`, its `message` (and artifact refs) are appended as a new
  `ContextEntry`; the executor threads the updated context to downstream nodes
  (§3.2). The run-service persists the final accumulated context to the run row.
- This is the single source of "what each agent sees": **the message plus every
  prior agent's output**, exactly the validated decision.

---

## 6. Loops-with-cap + optional approval gates

### 6.1 Feedback loops (critic → improver)

- Reuse `RoxLoop` (`types.ts:54`) with `maxIterations`. A feedback loop is a
  `RoxLoop` whose `nodes` include e.g. `[critic, improver]` with an edge
  `critic --(needs_work)--> improver --> critic`.
- **Executor delta:** the `loop` branch must honor `maxIterations` (cap) and a
  loop-exit condition (e.g. critic emits handle `"approved"` vs `"needs_work"`).
  Today `validateGraph`/`detectCycles` reject raw cycles; loops are expressed via
  the `loops` map, so the executor iterates the loop body up to the cap, then
  forces the exit edge. Add `DEFAULT_MAX_LOOP_ITERATIONS = 5` and reject
  `maxIterations > 20` at validation.
- Each loop iteration appends to `AccumulatedContext`, so the improver sees the
  critic's latest feedback plus the full history.

### 6.2 Optional approval gates (reuse, auto by default)

- Reuse the `human_approval` block + `approval_requests` table verbatim. Auto by
  default = a pipeline simply omits approval nodes. To require sign-off, the
  canvas inserts a `human_approval` node between two `agent_run` nodes; the
  executor already pauses (`WorkflowExecutor.ts:114`) and `skill.run`
  (`skill.ts:474`) already records the pending `approval_requests` row and
  resumes via `approvals` on re-run. Pipeline runs inherit this for free.

---

## 7. Canvas UI (xyflow + ai-elements) screen map

`@xyflow/react` 12.10.2 is installed; `ai-elements/{canvas,node,edge,connection,
panel,controls,toolbar}.tsx` exist but are UNUSED. Wire them into a pipeline
builder available in **both** desktop and web (config is cloud + Electric-synced).

Screen map (desktop route under `_authenticated/_dashboard/pipelines`, mirrored
in web app routes):

```
/pipelines                      → PipelineListView   (list workflow_definitions
                                   WHERE engine="pipeline", project-scoped)
/pipelines/$pipelineId          → PipelineBuilder
  ├─ <Canvas> (ai-elements/canvas.tsx → ReactFlow)
  │   ├─ AgentNode      (node.tsx)  role badge, model, status dot from run steps
  │   ├─ TriggerNode    (node.tsx)  one of the 6 triggers; matchConfig editor
  │   ├─ ApprovalNode   (node.tsx)  human_approval block
  │   ├─ ResponseNode   (node.tsx)  terminal output
  │   └─ <Edge>/<Connection>        DAG wiring, loop edges styled distinctly
  ├─ <Panel> NodeInspector  (panel.tsx)  edit role/promptTemplate/trigger/loop cap
  ├─ <Toolbar> (toolbar.tsx)  add node, add trigger, validate, deploy, run-once
  ├─ <Controls> (controls.tsx)  zoom/fit
  └─ RolePalette  (drag skills(kind="agent") + the 4 built-in roles onto canvas)
/pipelines/$pipelineId/runs     → PipelineRunsView   (workflow_runs timeline,
                                   live via Electric + host agent:lifecycle)
/pipelines/$pipelineId/runs/$id → RunDetail (workflow_run_steps + accumulated
                                   context transcript)
```

Data binding:

- Graph reads/writes via `workflow.get` / `workflow.updateDraftState`
  (`workflow.ts:54,89`) — `RoxWorkflowState.blocks[*].position{x,y}` already
  stores canvas coordinates.
- Node palette from `skill.listNodeDefinitions` (`skill.ts:355`) + a new
  `pipeline.listRoles` (skills `kind="agent"`).
- Triggers via new `pipeline.*` router (CRUD on `pipeline_triggers`).
- Cache-first rendering rule (AGENTS.md #9): render persisted graph rows first;
  use `isReady` only to decide the empty/loading state when no data exists.
- Branding: RU-localized labels, surface as **ROX ONE**-consistent (no SuperCmd).

---

## 8. File-level task breakdown per package (build stages)

Each stage MUST end typecheck-clean for the packages it touches
(`bun run typecheck` filtered, or `bunx tsc --noEmit` in the package).
Order is dependency-safe: pure core → db → runtime → trpc → host → ui.

### Stage A — `@rox/workflow-core` (pure, no deps)
- NEW `src/agents/agentRolePreset.ts` — `AgentRolePreset`, `AgentRoleSettings`.
- NEW `src/context/accumulatedContext.ts` — `AccumulatedContext`, `ContextEntry`,
  `renderContextForPrompt`.
- NEW `src/triggers/triggerMatch.ts` — `PipelineEvent`, `TriggerMatchConfig`,
  `triggerMatches` (+ unit tests).
- EDIT `src/types.ts:12` — add `"agent_run"` to `CoreBlockType`.
- EDIT `src/blocks/coreBlocks.ts:7` — `defineBlock("agent_run", …)`.
- EDIT `src/schema/*` — validate `agent_run.subBlocks` (roleSkillSlug required).
- EDIT `src/index.ts` — export new modules.
- Verify: `bunx vitest run` in package + `tsc --noEmit`.

### Stage B — `@rox/db` (schema + migration)
- NEW `src/schema/pipeline.ts` — `pipelineTriggers` table (+ Insert/Select types).
- EDIT `src/schema/enums.ts` — `workflowEngineValues += "pipeline"`;
  `triggerKindValues += "project_initialized","service_connected"`;
  `objectTypeValues += "pipeline_trigger"`.
- EDIT `src/schema/workflow.ts` — add `skillVersions.agentConfig` jsonb;
  `workflowRuns.accumulatedContext` jsonb.
- EDIT `src/schema/index.ts` — export `pipeline.ts`.
- RUN `bunx drizzle-kit generate --name agent_pipelines` (offline only).
- Verify: `tsc --noEmit`; confirm a new file appears under `drizzle/` (do NOT edit it).

### Stage C — `@rox/workflow-runtime` (executor)
- EDIT `src/executor/types.ts` — `AgentRunRequest`, `AgentRunResultPort`,
  `AgentRunResolver`; extend `ExecuteOptions` with `resolveAgentRun`,
  `initialContext`.
- EDIT `src/executor/WorkflowExecutor.ts` — `agent_run` branch (§3.2);
  thread `runContext` accumulation; honor loop `maxIterations` cap.
- EDIT tests `WorkflowExecutor.test.ts` — agent_run happy-path + loop-cap +
  context-accumulation cases (injected fake resolver).
- Verify: `bunx vitest run` + `tsc --noEmit`.

### Stage D — `@rox/trpc` (pipeline router + resolver + dispatcher)
- NEW `src/router/pipeline/schema.ts` — zod inputs (create pipeline, upsert
  trigger, run-once, list roles, list runs).
- NEW `src/router/pipeline/pipeline.ts` — `pipelineRouter`: `list`, `get`,
  `createDraft` (engine="pipeline"), `updateGraph`, `upsertTrigger`,
  `listTriggers`, `deleteTrigger`, `listRoles`, `runOnce`, `listRuns`.
- NEW `src/router/pipeline/agent-run-service.ts` — `makeAgentRunResolver`
  (chat in-proc + CLI relay; emulates `dispatch.ts:42`).
- NEW `src/router/pipeline/dispatcher.ts` — `dispatchPipelineEvent` (§4.2).
- NEW `src/router/pipeline/roles.ts` — seed/list the 4 built-in roles as
  `skills(kind="agent")` (idempotent upsert): `prompt-improver`, `decomposer`,
  `orchestrator`, `critic`.
- EDIT `src/router/skill/run-service.ts:36` — widen `triggerKind` union; inject
  `resolveAgentRun` + `initialContext`; persist `accumulatedContext`.
- EDIT `src/root.ts:33` — mount `pipeline: pipelineRouter`.
- EDIT emit call sites: `v2-project` create, `integration`/`skill.bind`,
  artifact insert (each: one `dispatchPipelineEvent(...)`).
- Verify: `tsc --noEmit` for `@rox/trpc`.

### Stage E — host-service (emitters + agent execution read-back)
- EDIT `src/events/event-bus.ts` — emit `agent_run_finished` pipeline events on
  `broadcastAgentLifecycle` Stop (or expose a hook the dispatcher subscribes to).
- EDIT `src/runtime/chat/chat.ts` / `agents.ts:277` — surface the final
  assistant message + artifact refs so `makeAgentRunResolver` can read node output.
- EDIT `packages/chat/.../runtime.ts` — emit `user_sent_message` on send.
- Verify: `tsc --noEmit` for `@rox/host-service` + `@rox/chat`.

### Stage F — UI (`packages/ui` + `apps/desktop` + `apps/web`)
- NEW `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/*`
  — `PipelineListView`, `PipelineBuilder`, `PipelineRunsView`, `RunDetail`,
  node components (`AgentNode`/`TriggerNode`/`ApprovalNode`/`ResponseNode`),
  `NodeInspector`, `RolePalette`.
- REUSE `packages/ui/src/components/ai-elements/{canvas,node,edge,connection,
  panel,controls,toolbar}.tsx` (wire them; they are currently unused).
- MIRROR routes into `apps/web` (same components; config is cloud-synced).
- Bind to `pipeline.*` + `workflow.*` + `skill.listNodeDefinitions`; cache-first
  rendering (AGENTS.md #9); RU localization; ROX ONE branding.
- Verify: `bun run typecheck` + `bun run lint` exit 0; Peekaboo screenshot of the
  builder as visual evidence.

### Stage G — cross-package verification
- `bun run typecheck` (all), `bun run lint` (Biome, warnings = errors),
  targeted `bun test packages/workflow-core packages/workflow-runtime`.
- Desktop smoke: create a 2-node pipeline (`prompt-improver` → `critic` loop),
  run-once, observe runs + accumulated transcript.

---

## 9. Risks / tradeoffs / open items

- **Loop semantics in the executor** are the heaviest change (today cycles are
  rejected; loops live in the `loops` map). Stage C must add bounded iteration
  + exit-handle evaluation without breaking existing topo/branch tests. If too
  large for one pass: scaffold the loop cap with `// TODO(agent-pipelines):` and
  ship single-iteration first, keeping everything compiling.
- **CLI agent read-back** (final message/diff from a worktree terminal) is
  inherently async; v1 can mark the node succeeded on `agent:lifecycle` Stop and
  attach the worktree diff as an artifact, refining message extraction later.
- **Electric sync** of `workflow_runs.accumulatedContext` (potentially large
  jsonb) — keep transcript entries lean (message text + artifact refs, not blobs).
- **Trigger storms** (e.g. `file_or_artifact_created` on bulk writes) — debounce
  in `dispatchPipelineEvent` and gate by `matchConfig` early.
- **Auth-gating** (AGENTS.md): pipeline UI only post-auth with an active org;
  dispatcher mints scoped JWTs exactly like `dispatchAutomation`.
- `dbWs` vs `db`: writes that the dispatcher performs from event paths should use
  `dbWs` (the websocket/relay pool) consistent with `dispatch.ts`.

---

## 10. What is real vs stubbed at spec time

- REAL (exists today, reused): graph contract + validation/topo/branch/join
  executor, `human_approval` pause/resume, `skill_call` nested runs, run/step
  persistence + redaction, `workflow_runs` trigger fields, cron→agent dispatch
  primitive, host agent launch (chat + terminal), event-bus WS, xyflow + unused
  ai-elements canvas, `skill(kind="agent")` enum.
- NEW (to build): `pipeline_triggers` table + registry, `dispatchPipelineEvent`
  + 6 emit call sites, `agent_run` block + executor branch + `resolveAgentRun`
  host bridge, `AgentRolePreset` + 4 built-in roles, `AccumulatedContext`
  contract + threading, loop-cap execution, the pipeline canvas + routes (web +
  desktop), the `pipeline.*` tRPC router.
- The `barrier` trigger needs **no new code** beyond canvas affordance — it is
  native executor join semantics.
