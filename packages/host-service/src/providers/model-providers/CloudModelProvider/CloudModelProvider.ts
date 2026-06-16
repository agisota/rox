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
import { buildAnthropicRuntimeEnv } from "../utils/anthropic-runtime-env";
import { applyRuntimeEnv } from "../utils/runtime-env";

const CLOUD_PROVIDER_ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_CUSTOM_HEADERS",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
	"OPENAI_BASE_URL",
	"CLAUDE_CODE_USE_BEDROCK",
	"AWS_REGION",
	"AWS_DEFAULT_REGION",
	"AWS_PROFILE",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
] as const;

interface CloudModelProviderOptions {
	envResolver?: () => Promise<Record<string, string | undefined>>;
	/** Injected for tests; defaults to a process-wide provisioner. */
	roxKeyProvisioner?: RoxKeyProvisioner;
}

function trimEnvValue(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export class CloudModelProvider implements ModelProviderRuntimeResolver {
	private readonly envResolver: () => Promise<
		Record<string, string | undefined>
	>;
	private readonly roxKeyProvisioner: RoxKeyProvisioner;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options?: CloudModelProviderOptions) {
		this.envResolver =
			options?.envResolver ??
			(async () => process.env as Record<string, string | undefined>);
		this.roxKeyProvisioner =
			options?.roxKeyProvisioner ?? createRoxKeyProvisioner();
	}

	private async resolveRuntimeEnv(context?: RuntimeEnvContext): Promise<{
		env: Record<string, string>;
		cleanupKeys: string[];
		hasUsableRuntimeEnv: boolean;
	}> {
		const sourceEnv = await this.envResolver();
		const nextEnv: Record<string, string> = {};

		for (const key of CLOUD_PROVIDER_ENV_KEYS) {
			const value = trimEnvValue(sourceEnv[key]);
			if (!value) continue;
			nextEnv[key] = value;
		}

		const anthropicEnv = buildAnthropicRuntimeEnv({
			ANTHROPIC_API_KEY: nextEnv.ANTHROPIC_API_KEY ?? "",
			ANTHROPIC_AUTH_TOKEN: nextEnv.ANTHROPIC_AUTH_TOKEN ?? "",
			ANTHROPIC_BASE_URL: nextEnv.ANTHROPIC_BASE_URL ?? "",
		});

		const rox = await resolveRoxRuntimeEnv(context, this.roxKeyProvisioner);
		// A custom OpenAI-compatible provider shares the OPENAI_* keys with Rox, so
		// it only applies when the Rox house model is NOT selected.
		const custom: CustomProviderRuntimeEnvResult = rox.isRoxModel
			? { env: {}, isCustomModel: false }
			: resolveCustomProviderRuntimeEnv(context);

		const env = {
			...nextEnv,
			...Object.fromEntries(
				Object.entries(anthropicEnv).filter(([, value]) => value.length > 0),
			),
			// Rox env (when selected) wins over any ambient OpenAI base/key so the
			// house model always targets the Rox endpoint with the per-user key.
			// A custom provider (when selected, and not Rox) likewise wins.
			...rox.env,
			...custom.env,
		};

		// Rox/custom base/key are set explicitly above. ROX_OPENAI_ENV_KEYS and
		// CUSTOM_OPENAI_ENV_KEYS are the same OPENAI_* pair; add them to cleanup so
		// stale values are cleared when neither model is active.
		const cleanupKeys = [...CLOUD_PROVIDER_ENV_KEYS] as string[];
		for (const key of [...ROX_OPENAI_ENV_KEYS, ...CUSTOM_OPENAI_ENV_KEYS]) {
			if (!cleanupKeys.includes(key)) cleanupKeys.push(key);
		}

		return {
			env,
			cleanupKeys,
			hasUsableRuntimeEnv: rox.isRoxModel
				? rox.error === null
				: custom.isCustomModel
					? true
					: Boolean(
							env.ANTHROPIC_API_KEY ||
								env.ANTHROPIC_AUTH_TOKEN ||
								env.OPENAI_API_KEY ||
								env.OPENAI_AUTH_TOKEN,
						),
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
