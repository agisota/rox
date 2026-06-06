/**
 * @superset/workflow-sim-adapter
 *
 * Compatibility layer between Sim workflows and the Superset Automation Fabric.
 *
 * Three integration modes are supported (see {@link SimIntegrationMode}):
 *  - `import_only`     — convert a Sim `WorkflowState` JSON into a Superset graph
 *  - `sidecar`         — call a Sim workflow over an API and wrap the result
 *  - `native_converted`— Superset stores + executes the converted graph itself
 *
 * Skeleton only at Milestone 0 — importers/exporters land in Milestone 10.
 */

export const WORKFLOW_SIM_ADAPTER_VERSION = "0.1.0";

export type SimIntegrationMode = "import_only" | "sidecar" | "native_converted";
