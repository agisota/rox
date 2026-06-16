import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import {
	buildCustomProviderModel,
	withCustomProviderModel,
} from "../providerActivation";

/**
 * Build the full set of models the user can actually select right now: the
 * server catalog ({@link ModelOption}s from `chat.getModels`) plus the model
 * from the user's configured custom OpenAI-compatible provider, if any.
 *
 * The model picker shows this same superset (it injects the custom model with
 * {@link withCustomProviderModel} internally), but the chat container resolves
 * the active model by id against whatever list it holds. If the container only
 * keeps the catalog, picking the custom model — whose id (`openai/<modelId>`)
 * is absent from the catalog — fails the lookup and the composer silently
 * falls back to the default house model ("ROX R1"). Resolving against this
 * superset keeps the picker, the slash-command `/model` path, and the active
 * pill all reading the same source of truth.
 *
 * Pure: no React/tRPC so it can be unit-tested directly.
 */
export function resolveSelectableModels(params: {
	models: ModelOption[];
	customProviderConfig: { modelId: string } | null | undefined;
}): ModelOption[] {
	const { models, customProviderConfig } = params;
	const customModel = buildCustomProviderModel(customProviderConfig);
	return withCustomProviderModel({ models, customModel });
}
