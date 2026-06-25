import type { ModelOption } from "../../../../types";
import {
	buildCustomProviderModels,
	withCustomProviderModels,
} from "../customProvider";

/**
 * Build the full set of models the user can select right now: the server catalog
 * plus every model from their configured custom OpenAI-compatible provider
 * (persisted + optionally live-discovered). The active-model lookup resolves
 * against this same superset so picking a custom model — whose id
 * (`rox-custom/<modelId>`) is absent from the catalog — does NOT miss the lookup
 * and silently snap back to the house model.
 *
 * Pure: no React/tRPC so it can be unit-tested directly.
 */
export function resolveSelectableModels(params: {
	models: ModelOption[];
	customProviderConfig: { models?: string[] } | null | undefined;
	discoveredModelIds?: string[];
}): ModelOption[] {
	const { models, customProviderConfig, discoveredModelIds } = params;
	const persistedModels = customProviderConfig?.models ?? [];
	const mergedModelIds =
		discoveredModelIds && discoveredModelIds.length > 0
			? [...new Set([...persistedModels, ...discoveredModelIds])]
			: persistedModels;
	const isConfigured =
		Boolean(customProviderConfig) && mergedModelIds.length > 0;
	const customModels = isConfigured
		? buildCustomProviderModels({ models: mergedModelIds })
		: [];
	return withCustomProviderModels({ models, customModels });
}
