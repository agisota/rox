import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";

/**
 * Group models by their provider display name, preserving first-seen order of
 * both providers and the models within each provider. Generic over the model
 * shape so callers can pass plain {@link ModelOption}s or enriched variants
 * without losing their extra fields.
 */
export function groupModelsByProvider<T extends ModelOption>(
	models: T[],
): Array<[string, T[]]> {
	const groups = new Map<string, T[]>();

	for (const model of models) {
		const existingGroup = groups.get(model.provider);
		if (existingGroup) {
			existingGroup.push(model);
			continue;
		}
		groups.set(model.provider, [model]);
	}

	return Array.from(groups.entries());
}
