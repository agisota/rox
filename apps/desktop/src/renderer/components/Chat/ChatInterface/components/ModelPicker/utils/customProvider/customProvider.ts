import type { ModelOption } from "../../../../types";

/**
 * Portable (React/tRPC-free) helpers for the user's custom OpenAI-compatible
 * provider. Shared by both chat panes so the picker, the active-model lookup,
 * and the sent turn all agree on how a custom model's id is shaped — preventing
 * the silent fallback to the house model when a persisted custom id is selected.
 */

/** Display name for the synthetic custom-provider group (RU product UI). */
export const CUSTOM_PROVIDER_DISPLAY_NAME = "Свой провайдер";

/** Wire-id prefix for custom-provider models (mirrors the server slug). */
export const CUSTOM_PROVIDER_WIRE_PREFIX = "rox-custom/";

/**
 * Build one {@link ModelOption} per configured custom model, de-duplicated by
 * bare id. Each gets the routing prefix so the emitted id is exactly the id the
 * picker sets active and the runtime routes through the custom provider.
 */
export function buildCustomProviderModels(
	config: { models?: string[] } | null | undefined,
): ModelOption[] {
	const models = config?.models;
	if (!Array.isArray(models)) return [];
	const seen = new Set<string>();
	const options: ModelOption[] = [];
	for (const rawId of models) {
		const modelId = rawId?.trim();
		if (!modelId || seen.has(modelId)) continue;
		seen.add(modelId);
		options.push({
			id: `${CUSTOM_PROVIDER_WIRE_PREFIX}${modelId}`,
			name: modelId,
			provider: CUSTOM_PROVIDER_DISPLAY_NAME,
		});
	}
	return options;
}

/** True when a model belongs to the synthetic custom-provider group. */
export function isCustomProviderModel(model: ModelOption): boolean {
	return model.provider === CUSTOM_PROVIDER_DISPLAY_NAME;
}

/**
 * Merge custom-provider models into the catalog (appended, de-duplicated by id)
 * so downstream filtering/grouping/lookup treat them uniformly.
 */
export function withCustomProviderModels(params: {
	models: ModelOption[];
	customModels: ModelOption[];
}): ModelOption[] {
	const { models, customModels } = params;
	if (customModels.length === 0) return models;
	const existingIds = new Set(models.map((model) => model.id));
	const additions = customModels.filter((model) => !existingIds.has(model.id));
	if (additions.length === 0) return models;
	return [...models, ...additions];
}
