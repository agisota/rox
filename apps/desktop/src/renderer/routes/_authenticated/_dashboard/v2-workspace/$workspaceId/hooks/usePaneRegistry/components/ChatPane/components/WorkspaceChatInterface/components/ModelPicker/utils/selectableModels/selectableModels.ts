import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import {
	buildCustomProviderModels,
	withCustomProviderModels,
} from "../providerActivation";

/**
 * Build the full set of models the user can actually select right now: the
 * server catalog ({@link ModelOption}s from `chat.getModels`) plus every model
 * from the user's configured custom OpenAI-compatible provider.
 *
 * The model picker shows this same superset (it injects the custom models with
 * {@link withCustomProviderModels} internally), but the chat container resolves
 * the active model by id against whatever list it holds. If the container only
 * keeps the catalog, picking a custom model — whose id (`rox-custom/<modelId>`)
 * is absent from the catalog — fails the lookup and the composer silently falls
 * back to the default house model ("ROX R1"). Resolving against this superset
 * keeps the picker, the slash-command `/model` path, and the active pill all
 * reading the same source of truth.
 *
 * `discoveredModelIds` lets the container merge a freshly refetched `/v1/models`
 * list (picker-open live refresh) on top of the persisted list without losing
 * the cache-first persisted entries.
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
