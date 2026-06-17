# Node-entry dispatch + maxTurns receipt

## Current state

- `WorkflowExecutor` already supports `entryNodeId`, but pipeline event dispatch did not pass the trigger row's `nodeId` through `runPipeline`, so triggered runs still entered through the graph start.
- Agent role dispatch normalized missing/invalid `maxTurns`, but did not hard-cap extreme values before crossing into host dispatch.
- Host `agents.runAndCapture` accepted `maxTurns` without a hard upper bound at the router boundary or before its injectable/live starter.
- Existing anti-storm guards remained in dispatcher: loop-replay short-circuit, ancestry cycle/depth guard, and short-window dedupe.

## Target state

- A pipeline trigger bound to `pipeline_triggers.nodeId` starts the run at that node via `WorkflowExecutor.execute(..., { entryNodeId })`.
- The full trigger payload is handed to the entry node as `input`, while `payload.message` still seeds the accumulated transcript when present.
- Agent pipeline `maxTurns` is a hard bounded value before relay/host dispatch: invalid/missing values default to `8`, and high values cap at `200`.
- Existing anti-storm constraints continue to pass their tests.

## Changed files

- `packages/workflow-core/src/agents/agentRunBridge.ts`
- `packages/workflow-core/src/agents/agentRunBridge.test.ts`
- `packages/workflow-core/src/agents/agentRolePreset.ts`
- `packages/trpc/src/router/pipeline/agent-run-host-bridge.ts`
- `packages/trpc/src/router/pipeline/dispatcher.ts`
- `packages/trpc/src/router/pipeline/dispatcher.test.ts`
- `packages/trpc/src/router/pipeline/run-pipeline.ts`
- `packages/trpc/src/router/pipeline/run-pipeline.test.ts`
- `packages/host-service/src/trpc/router/agents/agent-run-capture.ts`
- `packages/host-service/src/trpc/router/agents/agent-run-capture.test.ts`
- `packages/host-service/src/trpc/router/agents/agents.ts`
- `.bun-version`
- `package.json`
- `plans/receipts/2026-06-17-node-entry-maxturns.md`

## Commands and evidence

### TDD RED

- `bun test packages/workflow-core/src/agents/agentRunBridge.test.ts` failed before implementation because `MAX_AGENT_MAX_TURNS` was not exported.
- `bun test packages/trpc/src/router/pipeline/run-pipeline.test.ts` failed before implementation because `WorkflowExecutor` options did not include `entryNodeId`.
- `bun test packages/trpc/src/router/pipeline/dispatcher.test.ts` failed before implementation because `buildDispatchedPipelineRunArgs` was not exported.
- `bun test packages/host-service/src/trpc/router/agents/agent-run-capture.test.ts` failed before implementation because `maxTurns: 999` reached `startAgent` unchanged.

### GREEN / quality gates

- `bun test packages/workflow-core/src/agents/agentRunBridge.test.ts` -> pass, 15 tests.
- `bun test packages/workflow-runtime/src/executor/WorkflowExecutor.test.ts` -> pass, 25 tests.
- `bun test packages/trpc/src/router/pipeline/run-pipeline.test.ts` -> pass, 1 test.
- `bun test packages/trpc/src/router/pipeline/dispatcher.test.ts` -> pass, 13 tests.
- `bun test packages/host-service/src/trpc/router/agents/agent-run-capture.test.ts` -> pass, 21 tests.
- `bunx @biomejs/biome@2.4.2 check --write --unsafe <changed files>` -> pass, formatted touched files.
- `bun run lint` -> pass, checked 5410 files.
- `bun run --cwd packages/workflow-core typecheck` -> pass.
- `bun run --cwd packages/trpc typecheck` -> pass.
- `bun run --cwd packages/host-service typecheck` -> pass.
- `bun run typecheck` -> pass, 34/34 turbo tasks.
- `codex --help`, `claude --help`, `omp --help` -> no shared `--max-turns` CLI flag found for the default terminal-agent adapters.
- CI parity fix: `bunx --bun bun@1.3.11 test --isolate` in `packages/trpc`
  reproduced a Bun 1.3.11 `mock.module` leak where `run-pipeline.test.ts`
  mocked `./agent-run-service` and the mock bled into
  `agent-run-service.test.ts` despite `--isolate` (15 failures / 7 errors).
  `bun test --isolate` on Bun 1.3.14 passes the same `@rox/trpc` suite
  (221 tests), so the repo Bun pins were bumped from 1.3.11 to 1.3.14.

## Remaining risks

- The host chat/terminal harness receives the bounded value structurally. The installed CLI adapters checked in this worktree do not expose a shared `--max-turns` flag, so per-CLI turn-stop enforcement still depends on downstream harness support.
- No live DB-backed event dispatch was run in this worktree; coverage is unit-level around argument construction and existing storm guards.
