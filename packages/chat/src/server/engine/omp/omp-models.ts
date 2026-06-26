/**
 * Maps Rox wire model ids (`<provider>/<model>`, see
 * `@rox/shared` `AVAILABLE_CHAT_MODELS`) to the `--model` argument and provider
 * env var omp (`oh-my-pi`) expects.
 *
 * omp natively understands `groq/…`, `openai/…`, `anthropic/…`, `google/…`,
 * `deepseek/…` provider-prefixed ids (verified via `omp --list-models`), so the
 * Rox wire id is passed through to `--model` almost verbatim. The one mapping
 * that matters for a headless run is which provider API-key env var to populate
 * in the child so omp can authenticate.
 */

/** The provider env var omp reads for each provider prefix. */
const PROVIDER_ENV_VAR: Record<string, string> = {
	groq: "GROQ_API_KEY",
	openai: "OPENAI_API_KEY",
	anthropic: "ANTHROPIC_API_KEY",
	google: "GEMINI_API_KEY",
	gemini: "GEMINI_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	xai: "XAI_API_KEY",
	mistral: "MISTRAL_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

/** mastracode `authStorage` provider id for each prefix (for key lookup). */
const PROVIDER_AUTH_ID: Record<string, string> = {
	groq: "groq",
	openai: "openai",
	anthropic: "anthropic",
	google: "google",
	gemini: "google",
	deepseek: "deepseek",
	xai: "xai",
	mistral: "mistral",
	openrouter: "openrouter",
};

export interface OmpModelRouting {
	/** The `--model` value handed to omp. */
	ompModelId: string;
	/** The provider prefix (e.g. `groq`), or null if the id is unprefixed. */
	provider: string | null;
	/** The env var omp reads for this provider's key, or null if unknown. */
	envVar: string | null;
	/** The mastracode authStorage provider id to read a key from, or null. */
	authProviderId: string | null;
}

/**
 * Resolve omp routing for a Rox wire model id. The provider prefix is preserved
 * (omp wants `groq/llama-3.3-70b-versatile`, not the bare model), and the env
 * var / auth id are derived from the prefix.
 */
export function resolveOmpModelRouting(wireModelId: string): OmpModelRouting {
	const trimmed = wireModelId.trim();
	const slashIndex = trimmed.indexOf("/");
	const provider =
		slashIndex > 0 ? trimmed.slice(0, slashIndex).toLowerCase() : null;

	return {
		ompModelId: trimmed,
		provider,
		envVar: provider ? (PROVIDER_ENV_VAR[provider] ?? null) : null,
		authProviderId: provider ? (PROVIDER_AUTH_ID[provider] ?? null) : null,
	};
}
