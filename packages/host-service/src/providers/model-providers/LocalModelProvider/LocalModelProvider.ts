import {
	CUSTOM_OPENAI_ENV_KEYS,
	type CustomProviderRuntimeEnvResult,
	resolveCustomProviderRuntimeEnv,
} from "../CustomModelProvider";
import type { RoxKeyProvisioner } from "../RoxModelProvider";
import {
	createRoxKeyProvisioner,
	ROX_OPENAI_ENV_KEYS,
	resolveRoxRuntimeEnv,
} from "../RoxModelProvider";
import type { ModelProviderRuntimeResolver, RuntimeEnvContext } from "../types";
import {
	buildAnthropicRuntimeEnv,
	getAnthropicEnvConfig,
	stripAnthropicCredentialEnvVariables,
} from "../utils/anthropic-runtime-env";
import { applyRuntimeEnv } from "../utils/runtime-env";
import {
	hasUsableCredential,
	resolveAnthropicCredential,
	resolveOpenAICredential,
} from "./utils";

const CLEANUP_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
	"OPENAI_BASE_URL",
] as const;

interface LocalModelProviderOptions {
	anthropicEnvConfigPath?: string;
	/** Injected for tests; defaults to a process-wide provisioner. */
	roxKeyProvisioner?: RoxKeyProvisioner;
}

export class LocalModelProvider implements ModelProviderRuntimeResolver {
	private readonly anthropicEnvConfigPath?: string;
	private readonly roxKeyProvisioner: RoxKeyProvisioner;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options?: LocalModelProviderOptions) {
		this.anthropicEnvConfigPath = options?.anthropicEnvConfigPath;
		this.roxKeyProvisioner =
			options?.roxKeyProvisioner ?? createRoxKeyProvisioner();
	}

	private async resolveRuntimeEnv(context?: RuntimeEnvContext): Promise<{
		env: Record<string, string>;
		cleanupKeys: string[];
		hasUsableRuntimeEnv: boolean;
	}> {
		const rox = await resolveRoxRuntimeEnv(context, this.roxKeyProvisioner);
		// A custom OpenAI-compatible provider routes through the same OPENAI_*
		// keys as Rox, so it can only apply when the Rox house model is NOT the
		// selected model (the two model ids never collide).
		const custom: CustomProviderRuntimeEnvResult = rox.isRoxModel
			? { env: {}, isCustomModel: false }
			: resolveCustomProviderRuntimeEnv(context);

		// When the Rox house model OR a custom OpenAI-compatible model is selected,
		// the OpenAI-compatible client must point at that endpoint. Keep
		// OPENAI_BASE_URL/OPENAI_API_KEY out of the cleanup list so the values we
		// just set are not stripped before the harness reads them.
		const keepOpenAIKeys = rox.isRoxModel || custom.isCustomModel;
		const protectedKeys = rox.isRoxModel
			? ROX_OPENAI_ENV_KEYS
			: CUSTOM_OPENAI_ENV_KEYS;
		const cleanupKeys = keepOpenAIKeys
			? CLEANUP_KEYS.filter(
					(key) => !(protectedKeys as readonly string[]).includes(key),
				)
			: [...CLEANUP_KEYS];

		const anthropicCredential = await resolveAnthropicCredential();
		const openaiCredential = resolveOpenAICredential();
		const anthropicEnvConfig = getAnthropicEnvConfig({
			configPath: this.anthropicEnvConfigPath,
		});
		const runtimeEnv = buildAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(anthropicEnvConfig.variables),
		);

		return {
			env: { ...runtimeEnv, ...rox.env, ...custom.env },
			cleanupKeys,
			hasUsableRuntimeEnv: rox.isRoxModel
				? rox.error === null
				: custom.isCustomModel
					? true
					: hasUsableCredential(anthropicCredential) ||
						hasUsableCredential(openaiCredential),
		};
	}

	async hasUsableRuntimeEnv(context?: RuntimeEnvContext): Promise<boolean> {
		return (await this.resolveRuntimeEnv(context)).hasUsableRuntimeEnv;
	}

	async prepareRuntimeEnv(context?: RuntimeEnvContext): Promise<void> {
		const runtimeEnv = await this.resolveRuntimeEnv(context);
		this.currentRuntimeEnv = applyRuntimeEnv(
			runtimeEnv.env,
			runtimeEnv.cleanupKeys,
			this.currentRuntimeEnv,
		);
	}
}
