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

/**
 * A model carried by the user's configured custom provider. Built from the
 * persisted custom-provider config (base URL + chosen model id) so the picker
 * can list and select it like any catalog model.
 */
export function buildCustomProviderModel(
	config: { modelId: string } | null | undefined,
): ModelOption | null {
	const modelId = config?.modelId?.trim();
	if (!modelId) return null;
	return {
		// Prefix mirrors how the runtime routes custom models through the
		// OpenAI-compatible client; the bare id is what the user picked.
		id: `openai/${modelId}`,
		name: modelId,
		provider: CUSTOM_PROVIDER_DISPLAY_NAME,
	};
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
 * Merge the configured custom-provider model into the catalog list (appended,
 * de-duplicated by id) so downstream filtering/grouping treats it uniformly.
 */
export function withCustomProviderModel(params: {
	models: ModelOption[];
	customModel: ModelOption | null;
}): ModelOption[] {
	const { models, customModel } = params;
	if (!customModel) return models;
	if (models.some((model) => model.id === customModel.id)) return models;
	return [...models, customModel];
}
