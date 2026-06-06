/**
 * @superset/workflow-runtime
 *
 * Executes Superset workflow graphs: it walks the validated execution plan from
 * `@superset/workflow-core`, runs each block via Superset adapters (DB, host
 * service, secrets, policy), records `workflow_runs` / `workflow_run_steps`,
 * builds context packs, and produces artifacts + object relations.
 *
 * Skeleton only at Milestone 0 — the executor and block implementations land in
 * Milestone 4.
 */

export const WORKFLOW_RUNTIME_VERSION = "0.1.0";
