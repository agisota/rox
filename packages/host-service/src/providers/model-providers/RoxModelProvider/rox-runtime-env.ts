import { isRoxHouseModel, resolveRoxBaseUrl } from "@rox/shared/chat-models";
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
 * Stable user id used to scope a provisioned key. The host-service runs a
 * single signed-in user per process, so a process-stable constant is
 * sufficient until multi-user hosting lands. Centralised here so the
 * provisioning cache key has one definition.
 */
const HOST_USER_SCOPE = "host";

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

	const resolution = await provisioner.resolveKey(HOST_USER_SCOPE);
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
