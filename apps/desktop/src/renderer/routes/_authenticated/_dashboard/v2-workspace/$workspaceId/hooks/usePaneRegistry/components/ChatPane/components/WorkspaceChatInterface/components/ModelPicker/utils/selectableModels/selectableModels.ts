// Re-export the canonical, shared resolver so the v2 pane and the legacy pane
// use one source of truth for "which models can be selected right now" (catalog
// + persisted/live custom-provider models). See the shared implementation for
// the full rationale (preventing the silent fallback to the house model).
export { resolveSelectableModels } from "renderer/components/Chat/ChatInterface/components/ModelPicker/utils/selectableModels";
