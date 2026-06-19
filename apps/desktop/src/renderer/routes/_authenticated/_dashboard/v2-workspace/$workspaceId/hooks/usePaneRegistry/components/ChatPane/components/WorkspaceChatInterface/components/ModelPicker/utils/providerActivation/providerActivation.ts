import { ROX_CHAT_PROVIDER } from "@rox/shared/chat-models";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import {
	type AuthStatusLike,
	deriveModelProviderStatus,
	type ProviderId,
} from "shared/ai/provider-status";

/**
 * Decides which models the picker is allowed to show.
 *
 * The catalog ({@link AVAILABLE_CHAT_MODELS}) lists every gateway model across
 * every provider, but a user has only authenticated a subset. We hide models
 * whose provider the user has not activated so the list reflects what they can
 * actually run. Two things always survive the filter regardless of connection
 * state:
 *   - the Rox house model ("ROX R1"), which is free + managed server-side;
 *   - any model from the user's own custom OpenAI-compatible provider, which is
 *     only ever present when they explicitly configured + saved it.
 *
 * All functions here are pure so they can be unit-tested without React/tRPC.
 */

/** Display name for the synthetic custom-provider group (RU product UI). */
export const CUSTOM_PROVIDER_DISPLAY_NAME = "Свой провайдер";

/**
 * Map a model's provider display name (as carried on {@link ModelOption}) to a
 * {@link ProviderId}. Display names come from {@link AVAILABLE_CHAT_MODELS}
 * ("Anthropic", "OpenAI", "Groq", "Google Gemini", "DeepSeek", "Rox") and the
 * custom group. Returns null for anything unrecognised so the caller can decide
 * how to treat it (custom models are matched separately, by group name).
 */
export function providerDisplayNameToId(provider: string): ProviderId | null {
	const normalized = provider.trim().toLowerCase();
	if (normalized === ROX_CHAT_PROVIDER.toLowerCase() || normalized === "rox") {
		return "rox";
	}
	if (normalized.includes("anthropic") || normalized.includes("claude")) {
		return "anthropic";
	}
	if (normalized.includes("openai") || normalized.includes("gpt")) {
		return "openai";
	}
	if (normalized.includes("groq")) return "groq";
	if (normalized.includes("google") || normalized.includes("gemini")) {
		return "google";
	}
	if (normalized.includes("deepseek")) return "deepseek";
	return null;
}

/** The auth status inputs the picker collects, keyed by provider. */
export type ProviderAuthStatuses = Partial<Record<ProviderId, AuthStatusLike>>;

/**
 * Compute the set of providers the user has activated (connected, no blocking
 * issue). `rox` is always treated as activated. A provider counts as activated
 * only when {@link deriveModelProviderStatus} reports `connectionState` of
 * `"connected"` — i.e. authenticated with no expired/needs-attention issue.
 */
export function getActivatedProviderIds(
	statuses: ProviderAuthStatuses,
): Set<ProviderId> {
	const activated = new Set<ProviderId>(["rox"]);

	for (const [providerId, authStatus] of Object.entries(statuses) as Array<
		[ProviderId, AuthStatusLike | undefined]
	>) {
		if (!authStatus) continue;
		const status = deriveModelProviderStatus({ providerId, authStatus });
		if (status.connectionState === "connected") {
			activated.add(providerId);
		}
	}

	return activated;
}

/** Wire-id prefix for custom-provider models (mirrors the server slug). */
export const CUSTOM_PROVIDER_WIRE_PREFIX = "rox-custom/";

/**
 * The models carried by the user's configured custom provider. Built from the
 * persisted custom-provider config's full `models` list so the picker can list
 * and select every one like a catalog model. Emits one {@link ModelOption} per
 * model, de-duplicated by bare id.
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
			// Prefix mirrors how the runtime routes custom models through the
			// registered mastracode custom provider; the bare id is the model name.
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
 * Filter the catalog down to selectable models for this user: the Rox house
 * model, any custom-provider model, and models whose provider is activated.
 * Order of the input is preserved (ranking happens later, per group).
 */
export function filterModelsByActivation(params: {
	models: ModelOption[];
	activatedProviderIds: Set<ProviderId>;
}): ModelOption[] {
	const { models, activatedProviderIds } = params;
	return models.filter((model) => {
		if (isCustomProviderModel(model)) return true;
		const providerId = providerDisplayNameToId(model.provider);
		if (providerId === "rox") return true;
		if (providerId === null) return false;
		return activatedProviderIds.has(providerId);
	});
}

/**
 * Merge the configured custom-provider models into the catalog list (appended,
 * de-duplicated by id) so downstream filtering/grouping treats them uniformly.
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
