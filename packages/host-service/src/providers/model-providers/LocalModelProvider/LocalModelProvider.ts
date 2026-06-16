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

		// When the Rox house model is selected, the OpenAI-compatible client must
		// point at the Rox endpoint. Keep OPENAI_BASE_URL/OPENAI_API_KEY out of
		// the cleanup list so the values we just set are not stripped before the
		// harness reads them.
		const cleanupKeys = rox.isRoxModel
			? CLEANUP_KEYS.filter(
					(key) => !(ROX_OPENAI_ENV_KEYS as readonly string[]).includes(key),
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
			env: { ...runtimeEnv, ...rox.env },
			cleanupKeys,
			hasUsableRuntimeEnv: rox.isRoxModel
				? rox.error === null
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
