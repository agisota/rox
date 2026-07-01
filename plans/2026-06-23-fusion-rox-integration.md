# Fusion -> Rox Integration Decision

## Reformulated Task

Integrate RunFusion/Fusion into Rox in one execution phase by first grounding the
data model, then adding a reversible typed boundary Rox can use to create,
read, and mirror Fusion work without making Fusion the owner of Rox identity,
projects, tasks, or workflow history.

## Boundaries

- Rox remains authoritative for org, user, project, workspace, access policy,
  canonical task identity, workflow definitions, workflow runs, and artifacts.
- Fusion is treated as a local sidecar/runtime and board source.
- No Postgres enum or generated migration is changed in this slice.
- Fusion CLI/database access is host-side only. Renderer code must keep using
  Rox tRPC boundaries.

## Rox ERD View

- `tasks`: canonical task row, keyed by `id`, org-scoped, status via
  `task_statuses`, external sync uniqueness by `(organizationId,
  externalProvider, externalId)`.
- `workflow_definitions -> workflow_versions -> workflow_deployments`: Rox graph
  definition lifecycle.
- `workflow_runs -> workflow_run_steps`: canonical execution trace, with indexes
  on org/project/workflow/skill/status/run.
- `agent_sources`: org/project-scoped registry for external agent backends. The
  current enum does not include `fusion`; use `external_http` plus
  `config.provider = "fusion"` until a DB migration is justified.
- `runtime_services`: sidecar/health registry; current enum does not include
  Fusion, so the first slice exposes a draft config rather than a DB write.
- host-service SQLite `projects/workspaces/host_agent_configs`: local workspace
  and terminal-agent launch registry.
- agent-state SQLite `agent_run_coord/agent_state_entries/host_presence`: lease,
  CAS-like state, and host presence patterns for later Fusion task claims.

## Fusion ERD View

- `~/.fusion/fusion.db.tasks`: denormalized board task, keyed by `id`, with JSON
  arrays for `steps`, `log`, `attachments`, `comments`,
  `workflowStepResults`, plus node/run/checkout provenance columns.
- `~/.fusion/fusion.db.agentRuns`: keyed by `id`, FK `agentId -> agents.id`,
  indexed by `(agentId, startedAt)` and `status`.
- `~/.fusion/fusion.db.agents`: keyed by `id`, state-indexed runtime agents.
- `~/.fusion/fusion.db.workflows/workflow_*`: Fusion workflow definitions and
  execution work items.
- `~/.fusion/fusion.db.artifacts/approval_requests/messages/activityLog`: task
  outputs, gates, mailbox, and audit/event evidence.
- `~/.fusion/fusion-central.db.projects`: unique project path, node assignment,
  status and settings.
- `~/.fusion/fusion-central.db.nodes`: local/remote mesh nodes, status/type
  indexes, API URL/key, capacity, metrics.
- `~/.fusion/fusion-central.db.taskClaims`: `(projectId, taskId)` lease owner
  and lease epoch, analogous to Rox `agent_run_coord`.

## Options

1. Import Fusion DB directly into Rox schema.
   - Pro: fast-looking full copy.
   - Con: loses ownership boundaries, forces enum/migration churn, duplicates
     task/workflow semantics, and couples Rox to Fusion internal SQLite columns.

2. Run Fusion as a sidecar and mirror only typed task/run/node projections.
   - Pro: reversible, keeps Rox canonical, matches existing `agent_sources`,
     workflow trace, host-service, and agent-state boundaries.
   - Con: needs adapter code and explicit sync/trigger jobs.

3. Replace Rox pipelines with Fusion workflows.
   - Pro: one workflow engine.
   - Con: discards existing Rox Automation Fabric, pipeline triggers,
     accumulated context, approval handling, and tRPC/UI work.

## Decision

Use option 2: a sidecar adapter with Rox-owned mirrors. The first code slice is
`@rox/fusion-adapter`, which provides:

- typed Fusion task/project/node/agent-run parsers;
- Fusion CLI command boundary with argv-safe task creation;
- Rox task/run/step/source draft mappings;
- ERD metadata documenting how Fusion physical tables map to Rox concepts.

## Implemented Runtime Surface

- `@rox/fusion-adapter`: typed parser and mapping package.
- `host-service.fusion.status`: read-only tRPC discovery endpoint that checks
  `fn`, Fusion SQLite file presence, central project/node discovery, and returns
  a Rox `agent_sources` draft with `kind = "external_http"` and
  `config.provider = "fusion"`.
- `host-service.fusion.tasks`: read-only tRPC mirror endpoint that reads Fusion
  task rows through bounded `sqlite3 -readonly -json` and returns Rox task/step
  projections.
- Fusion CLI list commands are parsed from stdout even when the process must be
  timed out after producing valid JSON.

## Next State

After this slice, host-service can wire the adapter into:

- a local sync job that persists `fusion.tasks` projections into Rox task/run
  tables after an explicit storage decision;
- a pipeline resolver branch that dispatches async Fusion tasks and records
  task ids as child run refs;
- a UI panel localized through existing Rox renderer conventions.
