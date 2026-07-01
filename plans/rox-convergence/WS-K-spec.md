# WS-K: workflow-core assessment + chat `.codex/commands` slash source — Spec

## 1. Findings

### 1.1 workflow-core: how working is it really?

**Verdict: genuinely working, not schema-only.** `packages/workflow-core` is a pure-TS, side-effect-free domain layer (`packages/workflow-core/src/index.ts:1-33`, version `0.1.0` at `index.ts:16`) consumed broadly across the monorepo — by `apps/web`, `apps/desktop`, `packages/trpc` (the entire `router/pipeline/*`, `router/skill/*`, `router/executionCircuit/*`, `router/workflow/*`), `packages/workflow-runtime`, `packages/workflow-sim-adapter`, and `packages/db` schema (verified via grep of `@rox/workflow-core` importers). It is not a dangling stub.

Module-by-module maturity:

- **graph/** — real validation engine: `validateGraph.ts`, `detectCycles.ts`, `topologicalSort.ts`, `reachability.ts`, `loopWalk.ts`, `validateNestedWorkflowDepth.ts`. Each has a co-located `.test.ts`. This produces the `executionPlan` (topological linearization) the runtime depends on (`packages/workflow-runtime/src/executor/WorkflowExecutor.ts:108-119`). **Working.**
- **blocks/** — `CORE_BLOCKS` has 13 real block definitions with typed ports + risk levels: `start`, `response`, `condition`, `switch`, `loop`, `parallel`, `wait`, `delay`, `human_approval`, `skill_call`, `agent_run`, `error_boundary` (`packages/workflow-core/src/blocks/coreBlocks.ts:7-94`). Dynamic `skill_call:<slug>` helpers at `blockDefinition.ts:33-46`. **Working, but the definition list is metadata (label/ports/risk) — behavior lives in the runtime, see gap below.**
- **skills/** — `buildSkillNodeDefinition` derives draggable canvas nodes from a published skill's JSON-schema contract (`skillNodeDefinition.ts:51-61`), mapping object properties → named ports (`schemaToPorts`, `skillNodeDefinition.ts:30-45`). **Working.**
- **schema/** — input/output/skill-input-mapping validators (`validateInput.ts`, `validateOutput.ts`, `validateSkillInputMapping.ts`, `jsonSchema.ts`). Used by the executor for output-contract enforcement (`WorkflowExecutor.ts:474-488`). **Working.**
- **prompt/** — prompt-board → graph planner. `PromptPlanner` port (`promptPlan.ts:32-38`) + `promptPlanToWorkflowState` (`promptPlan.ts:45-72`). The only shipped implementation is `FakePromptPlanner` (`fakePlanner.ts:44-69`): a deterministic keyword classifier (`classifyCard`, `fakePlanner.ts:9-30`) that chains cards linearly `start → … → response`. **GAP: no LLM-backed planner exists** — the docstring explicitly says "Swap in a real LLM-backed planner behind the same `PromptPlanner` port" (`fakePlanner.ts:42-43`). Note `classifyCard` emits block types (`create_task`, `detect_risks`, `analyze_architecture`, `read_repo`, `create_artifact`, `agent`) that are **NOT in `CORE_BLOCKS`** — these are domain-skill block types, so a fake-generated graph relies on injected handlers/skill resolvers to run.
- **circuit/** — the "execution circuit" state-machine layer: `types.ts` (StateSpec/TransitionSpec/ExecutionMonadSpec, `circuit/types.ts:17-100`), `schema.ts`, `validateExecutionCircuitSpec.ts`, `compileTransitionPrompt.ts`, `computeMonadCompleteness.ts`, `defaultCircuitForTask.ts` (96 lines — a filled default). The header is honest that this is the "FOUNDATION slice: pure data shapes + deterministic functions. There is no JS runtime, graph scheduler, or retry logic here" (`circuit/types.ts:11-13`). **Working as a typed spec layer; runtime binding is consumed elsewhere (`trpc/router/executionCircuit`).**
- **triggers/** — `pipelineEventBus`, `pipelineEventSources`, `triggerMatch`, all with tests. **Working.**
- **policies/** — `policyEvaluator.ts` + types + tests. **Working.**
- **evals/** — `evaluateCase.ts` (110 lines) + test. **Working.**
- **agents/** — `agentRolePreset.ts`, `agentRunBridge.ts` (+ test). **Working.**

**Execution proof:** the actual interpreter is `packages/workflow-runtime/src/executor/WorkflowExecutor.ts` (555 lines). It performs real topological execution with conditional branch pruning (`edgeFires`, `WorkflowExecutor.ts:150-154`), parallel join via `mergeInputs` (`:55-59`), bounded feedback loops (`walkLoop`, `:502-546`, capped by `resolveLoopIterationCap` `:37-45`, default 5 / max 20 `:33-34`), human-approval pause/resume (`:209-254`), skill-call child runs (`:257-307`), `agent_run` dispatch with accumulated context threading (`:312-391`), node-entry trigger dispatch (`:125-136`), secret redaction (`:98-106`), and output-schema validation (`:474-488`). This is a real engine, not a placeholder.

**Test coverage:** 14 `.test.ts` files, **101 `it()`/`test()` cases** in workflow-core; runtime adds `WorkflowExecutor.test.ts` + `smoke.test.ts`.

#### Covered vs SHOULD be covered (capability gaps)

| Capability | State | Evidence |
|---|---|---|
| Graph validation / topo / cycles / reachability / nested-depth | ✅ Covered + tested | `graph/*` |
| Core block contracts (13 blocks) | ✅ Covered | `coreBlocks.ts:7-94` |
| Skill-node derivation from schema | ✅ Covered | `skillNodeDefinition.ts` |
| Deterministic graph execution (branch/join/loop/approval/skill/agent) | ✅ Covered (runtime) | `WorkflowExecutor.ts` |
| Execution circuit spec + validation | ✅ Covered (data layer only) | `circuit/*` |
| Triggers / event bus / sources | ✅ Covered + tested | `triggers/*` |
| Policies / evals | ✅ Covered + tested | `policies/*`, `evals/*` |
| Filled example workflows (templates) | ✅ Covered (in app layer) | `apps/web/.../pipelines/components/templates.ts:1-209` (PipelineTemplate + 4 RoleTemplates, RU prompts) |
| **LLM-backed prompt planner** | ❌ GAP — only `FakePromptPlanner` | `fakePlanner.ts:42-43` docstring |
| **`classifyCard` block types not in CORE_BLOCKS** | ⚠️ Consistency gap — fake-planner emits `create_task`/`detect_risks`/etc. with no core definition | `fakePlanner.ts:9-30` vs `coreBlocks.ts` |
| **Circuit → runtime scheduler/retry** | ⚠️ By-design gap (foundation slice) | `circuit/types.ts:11-13` |
| **Cross-host agent-state coordination** (Turso target per WS-H) | ❌ Absent here (correct — belongs at host-service) | n/a |

**Bottom line for the convergence plan:** workflow-core/runtime is mature enough to be the unified pipeline engine across web+desktop. Templates already exist (`templates.ts`). The two real product gaps are (1) a live LLM planner behind the existing `PromptPlanner` port, and (2) reconciling `classifyCard`'s emitted block types with the core/skill block catalog. **These are explicitly out of WS-K ownership** (assessment only) — they should be filed as a follow-up workstream (suggested: a future WS owning `packages/workflow-core/src/prompt/*` + a real planner adapter). No trivial in-place fix is claimed here.

### 1.2 Add `.codex/commands` as a slash-command source

**Current behavior** (`packages/chat/src/server/desktop/slash-commands/registry.ts:125-163`): `getCommandDirectoryEntries` returns 8 ordered dirs — project `.claude/commands`, `.claude/command`, `.agents/commands`, `.agents/command`, then home variants of the same four. First-writer-wins de-dup by command `name` (`registry.ts:236,246-248`), so **order = precedence**. Project beats global; within project, `.claude` beats `.agents` (`registry.test.ts:122-168`). `slash-commands.ts:4-5` docstring says it scans `.claude/*` and `.agents/*` only.

**Repo reality** (verified): `.codex/commands` already exists but is a **symlink → `../.agents/commands`** (and `.claude/commands` is likewise a symlink → `../.agents/commands`). So today `.codex` files are already reachable *via* the `.agents/commands` scan; adding `.codex/commands` as a literal source is only additive value when/if Codex gets its own real command dir, plus it adds the **home variant `~/.codex/commands`** which is NOT currently scanned. The change is still correct and low-risk (the existing-name de-dup makes a duplicated symlinked dir a no-op), and it makes the source set explicit/forward-compatible per AGENTS.md rule 3 (`.codex` is a first-class agent).

**Precedence decision:** insert `.codex/commands` + `.codex/command` **after** `.agents` within each scope (project block, then home block), so existing `.claude`/`.agents` definitions keep winning and `.codex` only adds names the others don't define. This is the least-surprising, zero-regression placement. The `source` tag stays `"project"` / `"global"` (the `SlashCommandSource` union is `"project" | "global" | "builtin"`, `types.ts:23` — no new source kind needed, and widening it would ripple into `slash-commands.ts`, `getSlashCommands`, and UI; out of scope).

## 2. Target design

### 2.1 Directory-scan order (data flow)

```
buildSlashCommandRegistry(cwd, {homeDirectory})
        │
        ▼
getCommandDirectoryEntries()  ── ordered list, first-name-wins ──┐
  PROJECT (cwd):                                                 │
   1 .claude/commands   (project)                                │
   2 .claude/command    (project)                                │
   3 .agents/commands   (project)                                │
   4 .agents/command    (project)                                │
   5 .codex/commands    (project)   ◄── NEW                       │
   6 .codex/command     (project)   ◄── NEW                       │
  HOME (~):                                                       │
   7 .claude/commands   (global)                                  │
   8 .claude/command    (global)                                  │
   9 .agents/commands   (global)                                  │
  10 .agents/command    (global)                                  │
  11 .codex/commands    (global)    ◄── NEW                       │
  12 .codex/command     (global)    ◄── NEW                       │
        │                                                         │
        ▼                                                         │
 for each existing dir → listMarkdownFiles → toCommandName ───────┘
        │   (skip if name already seen → precedence)
        ▼
 + getBuiltInSlashCommands()  (only names not already taken)
        ▼
 cache (1s TTL, 64 entries) → cloneSlashCommandRegistry → return
```

### 2.2 Why no type changes

`source` stays `"project" | "global"`. No new union member, no `SlashCommandSource` widening, no `resolver.ts` change (resolver reads `command.filePath` regardless of source). The blast radius is exactly one function body: `getCommandDirectoryEntries` (`registry.ts:125-163`).

## 3. Phase-2 implementation tasks (TDD)

> Single workstream, single file of production change + its test. Follow rox lint rule: run `bun run lint:fix` then `bun run lint < /dev/null` (exit 0) before push.

### Task K-1 — Failing test first: `.codex/commands` (project + global)
- **File:** `packages/chat/src/server/desktop/slash-commands/registry.test.ts` (modify — add cases).
- **Test approach:** reuse the existing `writeCommandFile` helper, widening its `commandRoot` union from `".claude" | ".agents"` to `".claude" | ".agents" | ".codex"` (`registry.test.ts:24`). Add three `it()` cases:
  1. `"loads commands from .codex/commands when only .codex is present"` — write `cwd` `.codex/commands/codex-only.md`, assert registry includes `codex-only` with `source: "project"`.
  2. `"loads commands from .codex/command (singular) too"` — mirrors the `.agents/command` singular test (`registry.test.ts:170-190`).
  3. `"loads global ~/.codex/commands"` — write under `home` `.codex/commands/home-codex.md`, assert `source: "global"`.
  4. `"respects precedence: .claude and .agents win over .codex for same name"` — write the same command name `dup` into project `.claude/commands`, `.agents/commands`, and `.codex/commands`; assert the surviving entry's body/description is the `.claude` one (first-writer-wins).
- **Expected before impl:** cases 1–3 fail (codex dirs not scanned); case 4 may pass partially. Run: `bun test packages/chat/src/server/desktop/slash-commands/registry.test.ts`.

### Task K-2 — Add `.codex` dirs to `getCommandDirectoryEntries`
- **File:** `packages/chat/src/server/desktop/slash-commands/registry.ts` (modify `getCommandDirectoryEntries`, `:125-163`).
- **Change:** insert two project entries after the `.agents/command` project entry (`:142-145`) and two home entries after the `.agents/command` home entry (`:158-161`):
  - project: `join(projectDirectory, ".codex", "commands")` → `"project"`, `join(projectDirectory, ".codex", "command")` → `"project"`.
  - home: `join(homeDirectory, ".codex", "commands")` → `"global"`, `join(homeDirectory, ".codex", "command")` → `"global"`.
- **Expected behavior:** K-1 cases all pass. `existsSync` guard (`registry.ts:241`) means absent `.codex` dirs are skipped; the `.codex → .agents` symlink in this repo is a harmless no-op (every name is already seen).

### Task K-3 — Update docstring to reflect the new source
- **File:** `packages/chat/src/server/desktop/slash-commands/slash-commands.ts` (modify docstring `:4-7`).
- **Change:** docstring text only — extend "Scan Markdown files under `.claude/*` and `.agents/*`" to "`.claude/*`, `.agents/*`, and `.codex/*`". No behavior change.
- **Test approach:** none (comment); covered by K-1.

### Task K-4 — Full gate
- Run `bun test packages/chat`, then `bun run lint:fix` + `bun run lint < /dev/null` (exit 0) + `bun run typecheck` (the test-helper union widening in K-1 must typecheck).

### Task K-5 (assessment deliverable — NO code) — workflow-core gap memo
- **Artifact:** this spec's §1.1 table is the deliverable. Record the two gaps (LLM planner; `classifyCard` block-type reconciliation) for a future prompt-planner workstream. No files owned/modified.

## 4. File ownership (Phase 2 — merge isolation)

This workstream owns **exactly**:
- `packages/chat/src/server/desktop/slash-commands/registry.ts` (modify `getCommandDirectoryEntries` only)
- `packages/chat/src/server/desktop/slash-commands/registry.test.ts` (add cases + widen `writeCommandFile` helper union)
- `packages/chat/src/server/desktop/slash-commands/slash-commands.ts` (docstring only)

**Explicitly NOT owned / do not touch:** `resolver.ts`, `types.ts`, `builtins.ts`, `frontmatter.ts`, `index.ts`, and the entire `packages/workflow-core/**` + `packages/workflow-runtime/**` trees (assessment only — any change there belongs to a separate planner workstream).

## 5. Dependencies + wave

- **Dependencies:** none. The slash-source change is self-contained in `packages/chat` and touches no shared contract used by other workstreams.
- **Coordinates with:** WS that owns broader `packages/chat` server work (if any) — but file ownership is scoped to the three `slash-commands/` files, so PRs merge cleanly. The workflow-core gaps (§1.1) hand off to whichever future WS owns `packages/workflow-core/src/prompt/*`.
- **Suggested wave:** **P0** — tiny, zero-dependency, unblocks Codex parity in the unified chat surface; can land first with no coordination.

## 6. Target PR

- **Branch:** `ws-k/chat-codex-slash-source`
- **PR title:** `feat(chat): add .codex/commands as a slash-command source (+ workflow-core assessment)`

### 7. Hardening review

Read-only verification pass against actual code (HEAD on `t/marketing-landing-publish-20260619`). Each claim spot-checked via Glob/Grep/Read.

#### 7a. Factual corrections (file:line)

1. **Block count is 12, not 13.** §1 (line 12) and the §1.1 table (line 31) say "CORE_BLOCKS has 13 real block definitions". `grep -c 'defineBlock(' packages/workflow-core/src/blocks/coreBlocks.ts` = **12**. The enumerated list in the spec itself lists exactly 12 names (start, response, condition, switch, loop, parallel, wait, delay, human_approval, skill_call, agent_run, error_boundary — `coreBlocks.ts:8-93`). Fix: "13" → "12" in both places.

2. **templates.ts path is wrong.** §1.1 table (line 37) cites `apps/web/.../pipelines/components/templates.ts`. Actual path is `apps/web/src/app/(agents)/agents/pipelines/components/templates.ts` (under the `(agents)/agents` route group, not a `(dashboard)/pipelines` path). Line count 209 and "PipelineTemplate + 4 RoleTemplates" claim are otherwise accurate (4 `*Template` symbols matched). There is also a desktop mirror: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/templates.ts` — worth citing as cross-platform evidence.

3. **"Each [graph file] has a co-located `.test.ts`" is false.** §1.1 (line 11) claims all six graph files are tested. Only 3 of 6 have co-located tests: `loopWalk.test.ts`, `validateGraph.test.ts`, `validateNestedWorkflowDepth.test.ts`. **No** co-located test exists for `detectCycles.ts`, `topologicalSort.ts`, `reachability.ts` (they are exercised transitively via `validateGraph.test.ts`, but the per-file claim is inaccurate). Fix wording to "validateGraph / loopWalk / validateNestedWorkflowDepth have co-located tests; detectCycles / topologicalSort / reachability are covered transitively."

4. **`classifyCard` block-type list is incomplete / the "not in CORE_BLOCKS" framing is imprecise.** §1.1 (line 15) and the table (line 39) list emitted types `create_task, detect_risks, analyze_architecture, read_repo, create_artifact, agent`. Verified against `fakePlanner.ts:9-30`: those six are correct, BUT `classifyCard`'s **first** branch emits `human_approval` (`fakePlanner.ts:11`), which **is** a core block (`coreBlocks.ts:64`). So the planner emits a mix — one core type (`human_approval`) plus six non-core domain types. The gap claim still holds for the six, but should be restated as "six of seven emitted types are non-core" rather than implying all emitted types are missing.

5. **Minor line-number drift (non-blocking).** `WorkflowExecutor.ts` is **554** lines, spec says 555 (§1.1 line 22). `index.ts` version is `WORKFLOW_CORE_VERSION` (not a bare `version` field) at `index.ts:16` — value `0.1.0` correct. All cited executor anchors verified present with ≤4-line drift: `edgeFires` `:150`, `mergeInputs` `:55`, `walkLoop` `:502`, `resolveLoopIterationCap` `:37`, `DEFAULT_MAX_LOOP_ITERATIONS=5`/`MAX_LOOP_ITERATIONS=20` `:33-34`, `human_approval` pause `:209-213`, `validateOutput` `:475`. Registry anchors verified exact: `getCommandDirectoryEntries` `:125-163`, de-dup `seenNames.has` `:246`, `existsSync` guard `:241`, builtins `:271-280`. `SlashCommandSource = "project" | "global" | "builtin"` confirmed `types.ts:23`. `writeCommandFile` helper + `commandRoot: ".claude" | ".agents"` confirmed `registry.test.ts:24`; `.agents/command` singular test `registry.test.ts:170`. Symlinks confirmed: `.codex/commands -> ../.agents/commands` and `.claude/commands -> ../.agents/commands`.

#### 7b. Brief questions not fully answered

- **`.codex/prompts` symlink ignored.** `.codex/` also contains `prompts -> ../.agents/commands` (alongside `commands -> ../.agents/commands`). The spec only proposes scanning `.codex/commands` + `.codex/command`. Decide explicitly: does Codex parity require scanning `.codex/prompts` too? (Codex CLI's native prompt dir is `prompts/`, not `commands/`.) If yes, the dir list / tests need a 3rd pair. Recommend documenting the deliberate exclusion if no.
- **"what SHOULD be covered" is under-specified.** The brief asked for expected-capability coverage. The §1.1 table covers present modules well but does not enumerate a target capability set (e.g., retry/backoff policy execution, sub-workflow nesting limits at runtime, scheduler/cron triggers, dead-letter/error-routing semantics, observability/metrics) and mark each present/absent. The two named gaps (LLM planner, classifyCard reconciliation) are real but likely not exhaustive.
- **Cache-invalidation interaction.** The 1s TTL registry cache (`registry.ts:15`, `REGISTRY_CACHE_TTL_MS`) is keyed on `projectDirectory|homeDirectory|builtin`. Adding `.codex` dirs does not change the key, so a freshly-created `.codex/commands` could be invisible for up to 1s after creation. Acceptable, but the test in K-1 should pass `useCache: false` (the existing tests already do — confirm K-1 mirrors that).
- **Test helper widening ripple.** K-1 widens `writeCommandFile`'s `commandRoot` union to include `".codex"`. Confirmed safe (default param stays `".claude"`, `registry.test.ts:24`), no other caller passes a literal — but worth an explicit note that the union is a closed literal type, so widening is non-breaking.

#### 7c. Merge-safety / file-ownership check

WS-K Phase-2 owns exactly three files (spec §4):
- `packages/chat/src/server/desktop/slash-commands/registry.ts`
- `packages/chat/src/server/desktop/slash-commands/registry.test.ts`
- `packages/chat/src/server/desktop/slash-commands/slash-commands.ts`

Cross-checked against the sibling-ownership rule (WS-A…WS-O; schema owned by WS-O except `economy.ts`=WS-E):
- **No overlap with WS-O schema ownership.** WS-K touches zero files under `packages/db/src/schema/**`. (Note: `workflow.ts`, `pipeline.ts`, `economy.ts` all import `@rox/workflow-core`, but WS-K only *assesses* workflow-core and owns none of those schema files.)
- **No overlap with WS-E** (`economy.ts`) — not touched.
- **workflow-core / workflow-runtime are assessment-only** — spec §4 explicitly disclaims ownership and proposes a *future* WS for `packages/workflow-core/src/prompt/*`. Confirmed no WS-K edit lands there. **No collision** with whatever sibling (if any) owns workflow-core.
- **`packages/chat` slash-command files**: the three owned files are a tightly-scoped subtree. Risk only if another sibling also claims `packages/chat/**`. The spec asserts none does (§5 "touches no shared contract"); I cannot confirm the negative without the other siblings' specs in hand — **flag for the integrator**: verify no sibling lists any `packages/chat/src/server/desktop/slash-commands/*` file. Given the narrow subtree, residual collision risk is **low**.
- **Symlink no-op confirmed**: because `.codex/commands` and `.claude/commands` both resolve to `../.agents/commands`, scanning all three in one repo yields duplicate command names that the `seenNames` de-dup (`registry.ts:246`) collapses — zero behavioral regression, confirmed by reading the de-dup path.

**Overlap verdict: none detected within the files I could inspect.** One unresolvable-here item flagged (other siblings' `packages/chat` claims).

#### 7d. Confidence per major claim

| Major claim | Confidence | Basis |
|---|---|---|
| workflow-core is genuinely working (not schema-only) | **High** | Read coreBlocks, fakePlanner, circuit/types, 554-line executor; 101 test cases verified |
| Only `FakePromptPlanner` exists; no LLM planner | **High** | `prompt/` dir has only fakePlanner.ts + promptPlan.ts + schema; docstring `fakePlanner.ts:42` |
| classifyCard emits non-core block types (gap) | **High** (with correction 4) | Read `fakePlanner.ts:9-30` vs `coreBlocks.ts` directly |
| 101 it/test cases, 14 test files | **High** | `grep -c` = 101, `find -name '*.test.ts'` = 14 |
| Registry change is one-function, zero type change | **High** | Read full `registry.ts`; `SlashCommandSource` union confirmed; de-dup logic read |
| `.codex` symlink makes change additive/no-op | **High** | `ls -la` resolved both symlinks to `../.agents/commands` |
| K-1/K-2/K-3 tasks are correct & sufficient | **Medium-High** | Logic sound; `.codex/prompts` exclusion + useCache:false in new tests are open (7b) |
| "what SHOULD be covered" fully answered | **Medium** | Present-state strong; target-capability set not enumerated (7b) |
| No file-ownership overlap with any sibling | **Medium** | Confirmed vs WS-O/WS-E schema rule; cannot verify other siblings' `packages/chat` claims without their specs (7c) |
