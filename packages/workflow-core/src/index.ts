/**
 * @rox/workflow-core
 *
 * Pure-TypeScript domain layer for the Rox Automation Fabric.
 *
 * This package contains NO React, NO database access, and NO runtime side
 * effects. It owns the workflow graph contract, graph validation, JSON-schema
 * validation for skill input/output, the block registry, skill node
 * definitions, and policy types. Everything here is deterministic and
 * unit-testable in isolation.
 *
 * Execution (DB writes, host calls, secrets) lives in `@rox/workflow-runtime`.
 * Sim import/export lives in `@rox/workflow-sim-adapter`.
 */

export const WORKFLOW_CORE_VERSION = "0.1.0";

export * from "./blocks";
export * from "./circuit";
export * from "./errors";
export * from "./evals";
export * from "./graph";
export * from "./policies";
export * from "./prompt";
export * from "./schema";
export * from "./skills";
export * from "./types";
