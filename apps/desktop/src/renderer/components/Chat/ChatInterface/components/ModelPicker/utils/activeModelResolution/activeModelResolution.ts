import type { ModelOption } from "../../../../types";

/**
 * Resolve the model the composer should use for the next turn, given the
 * persisted `selectedModelId` and the currently selectable models — WITHOUT the
 * historical silent swap to the house model when a persisted custom id can't be
 * found (discovery failed / provider reconfigured). An unresolved selection is
 * reported via `unresolvedModelId` so the UI can show a toast/badge instead of
 * pretending the swap never happened.
 *
 *   - no selection        → activeModel = default, unresolvedModelId = null
 *   - selection resolves  → activeModel = selection, unresolvedModelId = null
 *   - selection missing   → activeModel = default (so the turn still sends),
 *     unresolvedModelId = the missing id (caller surfaces the signal)
 *
 * Pure: no React/tRPC so it can be unit-tested directly.
 */
export function resolveActiveModel(params: {
	selectedModelId: string | null | undefined;
	availableModels: ModelOption[];
	defaultModel: ModelOption | null;
}): {
	activeModel: ModelOption | null;
	selectedModel: ModelOption | null;
	unresolvedModelId: string | null;
} {
	const { selectedModelId, availableModels, defaultModel } = params;

	if (!selectedModelId) {
		return {
			activeModel: defaultModel,
			selectedModel: null,
			unresolvedModelId: null,
		};
	}

	const selectedModel =
		availableModels.find((model) => model.id === selectedModelId) ?? null;

	if (selectedModel) {
		return {
			activeModel: selectedModel,
			selectedModel,
			unresolvedModelId: null,
		};
	}

	return {
		activeModel: defaultModel,
		selectedModel: null,
		unresolvedModelId: selectedModelId,
	};
}

/** RU product message for an unresolved custom-provider model selection. */
export function unresolvedModelMessage(modelId: string): string {
	return `Модель ${modelId} недоступна — проверьте custom-провайдер`;
}
