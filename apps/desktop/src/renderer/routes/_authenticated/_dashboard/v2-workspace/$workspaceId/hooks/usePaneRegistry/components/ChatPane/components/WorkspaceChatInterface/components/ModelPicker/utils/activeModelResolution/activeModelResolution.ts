// Re-export the canonical, shared resolver so the v2 pane and the legacy pane
// use one source of truth for resolving the active model without the historical
// silent fallback. See the shared implementation for the full rationale.
export {
	resolveActiveModel,
	unresolvedModelMessage,
} from "renderer/components/Chat/ChatInterface/components/ModelPicker/utils/activeModelResolution";
