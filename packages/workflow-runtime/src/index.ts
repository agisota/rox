/**
 * @rox/workflow-runtime
 *
 * Executes Superset workflow graphs: it walks the validated execution plan from
 * `@rox/workflow-core`, runs each block via Superset adapters (DB, host
 * service, secrets, policy), records `workflow_runs` / `workflow_run_steps`,
 * builds context packs, and produces artifacts + object relations.
 *
 * The executor (M4) is DB-free and port-based: persistence, host calls, and
 * secrets arrive via injected adapters, so the core is unit-testable.
 */

export const WORKFLOW_RUNTIME_VERSION = "0.1.0";

export * from "./context/Redactor";
export * from "./executor/InMemoryRunRecorder";
export * from "./executor/types";
export * from "./executor/WorkflowExecutor";
