/**
 * @rox/workflow-sim-adapter
 *
 * Compatibility layer between Sim workflows and the Rox Automation Fabric.
 *
 * Three integration modes are supported (see {@link SimIntegrationMode}):
 *  - `import_only`     — convert a Sim `WorkflowState` JSON into a Rox graph
 *  - `sidecar`         — call a Sim workflow over an API and wrap the result
 *  - `native_converted`— Rox stores + executes the converted graph itself
 *
 * The import path (M10) converts Sim `WorkflowState` JSON into a Rox graph.
 */

export const WORKFLOW_SIM_ADAPTER_VERSION = "0.1.0";

export type SimIntegrationMode = "import_only" | "sidecar" | "native_converted";

export * from "./importSimWorkflowState";
export * from "./simTypes";
