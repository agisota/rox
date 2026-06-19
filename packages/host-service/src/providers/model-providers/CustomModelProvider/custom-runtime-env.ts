import {
	type CustomProviderConfig,
	getCustomProviderConfig,
	stripCustomProviderPrefix,
} from "@rox/chat/server/desktop";
import type { RuntimeEnvContext } from "../types";

/**
 * Env keys the custom provider used to write. The custom OpenAI-compatible
 * provider no longer injects any process env: it is registered in mastracode's
 * global `settings.json` (written by `setCustomProviderConfig`), which the
 * harness reads to route `<slug>/<modelId>` through its OpenAI-compatible
 * chat-completions client. The previous `OPENAI_*` injection forced the
 * `/responses` path and could clobber real OpenAI auth, so it was removed.
 *
 * Kept as an empty tuple so existing cleanup-protection call sites keep
 * compiling; there is nothing custom to protect from the cleanup list anymore.
 */
export const CUSTOM_OPENAI_ENV_KEYS = [] as const;

export interface CustomProviderRuntimeEnvResult {
	/** Env to merge into the prepared runtime. Always empty now. */
	env: Record<string, string>;
	/** True when the selected model is one of the configured custom-provider models. */
	isCustomModel: boolean;
}

const EMPTY_RESULT: CustomProviderRuntimeEnvResult = {
	env: {},
	isCustomModel: false,
};

/**
 * True when `selectedModelId` (bare, `rox-custom/`-prefixed, or a stray legacy
 * `openai/`-prefixed id) refers to one of the configured custom-provider models.
 */
export function isCustomProviderModel(
	selectedModelId: string | null | undefined,
	config: CustomProviderConfig,
): boolean {
	if (!selectedModelId) return false;
	const normalized = stripCustomProviderPrefix(
		selectedModelId.trim(),
	).toLowerCase();
	return config.models.some(
		(model) => model.trim().toLowerCase() === normalized,
	);
}

/**
 * Report whether the selected model belongs to the configured custom provider.
 * No env is returned — the mastracode `settings.json` registration is the
 * cross-process bridge. The host providers still call this so they can mark the
 * turn as having a usable runtime when a custom model is selected.
 */
export function resolveCustomProviderRuntimeEnv(
	context: RuntimeEnvContext | undefined,
	options?: { configPath?: string },
): CustomProviderRuntimeEnvResult {
	const config = getCustomProviderConfig({ configPath: options?.configPath });
	if (!config) return EMPTY_RESULT;
	if (!isCustomProviderModel(context?.selectedModelId, config)) {
		return EMPTY_RESULT;
	}

	return {
		env: {},
		isCustomModel: true,
	};
}
