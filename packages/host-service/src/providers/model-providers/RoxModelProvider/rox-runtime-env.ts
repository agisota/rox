import { isRoxHouseModel, resolveRoxBaseUrl } from "@rox/shared/chat-models";
import { getHostId } from "@rox/shared/host-info";
import type { RuntimeEnvContext } from "../types";
import { RoxKeyProvisioner } from "./RoxKeyProvisioner";

/**
 * Env vars the Rox branch writes so the mastracode OpenAI-compatible client
 * targets the Rox endpoint. These are also the keys that must NOT be stripped
 * by a provider's cleanup list when the Rox model is active (otherwise the
 * base URL is deleted before the harness reads it).
 */
export const ROX_OPENAI_ENV_KEYS = [
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
] as const;

/**
 * Default scope used to bucket a provisioned per-user Rox key when the caller
 * does not pass an explicit {@link RuntimeEnvContext.userScope}. The host-service
 * runs a single signed-in user per process, so the stable, non-PII host id is
 * the right per-install bucket — it also lines up with OmniRouter's
 * `api_keys.machine_id` scoping. A caller that knows a real per-user id (multi-
 * user hosting) overrides this via the context.
 */
function defaultHostUserScope(): string {
	return `host:${getHostId()}`;
}

export interface RoxRuntimeEnvResult {
	/** Env to merge into the prepared runtime. Empty when not applicable. */
	env: Record<string, string>;
	/** True when the selected model is the Rox house model. */
	isRoxModel: boolean;
	/** Set when the Rox model is selected but no usable key could be resolved. */
	error: string | null;
}

const EMPTY_RESULT: RoxRuntimeEnvResult = {
	env: {},
	isRoxModel: false,
	error: null,
};

/**
 * Resolve the OpenAI-compatible env (`OPENAI_BASE_URL` + `OPENAI_API_KEY`) that
 * points mastracode at the Rox endpoint — but only when the selected model is
 * the Rox house model. For any other model this is a no-op.
 *
 * Returns a typed result rather than throwing so callers can surface a clear
 * "no Rox key" state and fall back to their normal credential path.
 */
export async function resolveRoxRuntimeEnv(
	context: RuntimeEnvContext | undefined,
	provisioner: RoxKeyProvisioner,
): Promise<RoxRuntimeEnvResult> {
	if (!isRoxHouseModel(context?.selectedModelId)) {
		return EMPTY_RESULT;
	}

	// Per-user key bucket: an explicit scope from the caller (real user id under
	// multi-user hosting) wins; otherwise the stable host id. This is what
	// decouples ROX R1 from the app.rox.one session — the resolved key is used
	// directly as OPENAI_API_KEY against the gateway.
	const userScope = context?.userScope?.trim() || defaultHostUserScope();
	const resolution = await provisioner.resolveKey(userScope);
	if (resolution.kind === "ok") {
		return {
			env: {
				OPENAI_API_KEY: resolution.apiKey,
				// Env-overridable (ROX_AI_BASE_URL); falls back to the default
				// api.zed.md gateway. Read from the same env the key came from.
				OPENAI_BASE_URL: resolveRoxBaseUrl(),
			},
			isRoxModel: true,
			error: null,
		};
	}

	// `unconfigured` means neither a static ROX_AI_API_KEY nor a provisioning URL
	// is set. The shared-key MVP only needs ROX_AI_API_KEY; provisioning is the
	// optional per-user layer, so it is intentionally listed second.
	const error =
		resolution.kind === "error"
			? resolution.message
			: "ROX R1 is not configured on this host (set ROX_AI_API_KEY, or optionally ROX_KEY_PROVISION_URL for per-user keys)";
	return { env: {}, isRoxModel: true, error };
}

/** Convenience factory so callers don't import the provisioner directly. */
export function createRoxKeyProvisioner(): RoxKeyProvisioner {
	return new RoxKeyProvisioner();
}
