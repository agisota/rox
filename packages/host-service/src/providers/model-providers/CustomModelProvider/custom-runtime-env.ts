import {
	type CustomProviderConfig,
	getCustomProviderConfig,
	stripOpenAIProviderPrefix,
} from "@rox/chat/server/desktop";
import type { RuntimeEnvContext } from "../types";

/**
 * Env vars the custom OpenAI-compatible provider writes so the mastracode
 * OpenAI-compatible client targets the user's endpoint. These mirror the Rox
 * keys; they must NOT be stripped by a provider's cleanup list while the custom
 * model is active (otherwise the base URL is deleted before the harness reads
 * it).
 */
export const CUSTOM_OPENAI_ENV_KEYS = [
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
] as const;

export interface CustomProviderRuntimeEnvResult {
	/** Env to merge into the prepared runtime. Empty when not applicable. */
	env: Record<string, string>;
	/** True when the selected model is the configured custom-provider model. */
	isCustomModel: boolean;
}

const EMPTY_RESULT: CustomProviderRuntimeEnvResult = {
	env: {},
	isCustomModel: false,
};

/**
 * True when `selectedModelId` (in any spelling, with or without an `openai/`
 * prefix) refers to the configured custom-provider model.
 */
export function isCustomProviderModel(
	selectedModelId: string | null | undefined,
	config: CustomProviderConfig,
): boolean {
	if (!selectedModelId) return false;
	const normalized = stripOpenAIProviderPrefix(
		selectedModelId.trim(),
	).toLowerCase();
	return normalized === config.modelId.trim().toLowerCase();
}

/**
 * Resolve the OpenAI-compatible env (`OPENAI_BASE_URL` + `OPENAI_API_KEY`) that
 * points mastracode at the user's custom endpoint — but only when the selected
 * model is the configured custom-provider model. For any other model this is a
 * no-op.
 *
 * The persisted config is the cross-process bridge: the desktop `ChatService`
 * writes it from settings; this resolver (run in the host-service runtime) reads
 * it back when preparing the env for a turn.
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
		env: {
			OPENAI_API_KEY: config.apiKey,
			OPENAI_BASE_URL: config.baseUrl,
		},
		isCustomModel: true,
	};
}
