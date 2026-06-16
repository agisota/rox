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
	/**
	 * Stable identity used to scope a per-user Rox key when provisioning is
	 * configured. The host-service runs a single signed-in user per process, so
	 * this is normally the org-scoped host id; it becomes a real per-user id once
	 * multi-user hosting lands. Optional: when omitted, the provider falls back to
	 * its configured default scope (host id).
	 */
	userScope?: string;
}

export interface ModelProviderRuntimeResolver {
	hasUsableRuntimeEnv(context?: RuntimeEnvContext): Promise<boolean>;
	prepareRuntimeEnv(context?: RuntimeEnvContext): Promise<void>;
}
