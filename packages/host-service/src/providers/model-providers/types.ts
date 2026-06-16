/**
 * Context passed to a runtime resolver so it can tailor the prepared env to the
 * model the user actually selected (e.g. point the OpenAI-compatible client at
 * the Rox endpoint only when the Rox house model is chosen).
 */
export interface RuntimeEnvContext {
	/**
	 * The chat model id selected for this turn, in whatever spelling the client
	 * sent (catalog id or provider-prefixed). Optional: callers that prepare a
	 * generic runtime (no specific model yet) omit it.
	 */
	selectedModelId?: string;
}

export interface ModelProviderRuntimeResolver {
	hasUsableRuntimeEnv(context?: RuntimeEnvContext): Promise<boolean>;
	prepareRuntimeEnv(context?: RuntimeEnvContext): Promise<void>;
}
