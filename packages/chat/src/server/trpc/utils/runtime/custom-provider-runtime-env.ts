import {
	type CustomProviderConfig,
	getCustomProviderConfig,
	stripOpenAIProviderPrefix,
	toCustomProviderWireModelId,
} from "../../../desktop/chat-service/custom-provider-config";

const CUSTOM_OPENAI_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;

type CustomOpenAIEnvKey = (typeof CUSTOM_OPENAI_ENV_KEYS)[number];

interface AppliedCustomProviderEnv {
	values: Record<CustomOpenAIEnvKey, string>;
	previous: Partial<Record<CustomOpenAIEnvKey, string>>;
}

let appliedCustomProviderEnv: AppliedCustomProviderEnv | null = null;
let customProviderRuntimeEnvTail = Promise.resolve();

function isCustomProviderModel(
	selectedModelId: string | null | undefined,
	config: CustomProviderConfig,
): boolean {
	if (!selectedModelId) return false;
	const normalized = stripOpenAIProviderPrefix(
		selectedModelId.trim(),
	).toLowerCase();
	return normalized === config.modelId.trim().toLowerCase();
}

function resolveCustomProviderConfigForModel(
	selectedModelId: string | null | undefined,
): CustomProviderConfig | null {
	const config = getCustomProviderConfig();
	if (!config) return null;
	return isCustomProviderModel(selectedModelId, config) ? config : null;
}

function clearAppliedCustomProviderRuntimeEnv(): void {
	const applied = appliedCustomProviderEnv;
	if (!applied) return;

	for (const key of CUSTOM_OPENAI_ENV_KEYS) {
		if (process.env[key] !== applied.values[key]) continue;
		const previous = applied.previous[key];
		if (previous === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = previous;
		}
	}

	appliedCustomProviderEnv = null;
}

export function resolveCustomProviderRuntimeModelId(
	selectedModelId: string | null | undefined,
): string | undefined {
	const trimmed = selectedModelId?.trim();
	if (!trimmed) return undefined;

	const config = resolveCustomProviderConfigForModel(trimmed);
	return config ? toCustomProviderWireModelId(config.modelId) : trimmed;
}

export function prepareCustomProviderRuntimeEnv(
	selectedModelId: string | null | undefined,
): { isCustomModel: boolean; modelId?: string } {
	const trimmed = selectedModelId?.trim();
	if (!trimmed) {
		clearAppliedCustomProviderRuntimeEnv();
		return { isCustomModel: false };
	}

	const config = resolveCustomProviderConfigForModel(trimmed);
	if (!config) {
		clearAppliedCustomProviderRuntimeEnv();
		return { isCustomModel: false, modelId: trimmed };
	}

	clearAppliedCustomProviderRuntimeEnv();

	const values = {
		OPENAI_API_KEY: config.apiKey,
		OPENAI_BASE_URL: config.baseUrl,
	};
	const previous: Partial<Record<CustomOpenAIEnvKey, string>> = {};
	for (const key of CUSTOM_OPENAI_ENV_KEYS) {
		previous[key] = process.env[key];
		process.env[key] = values[key];
	}
	appliedCustomProviderEnv = { values, previous };

	return {
		isCustomModel: true,
		modelId: toCustomProviderWireModelId(config.modelId),
	};
}

export async function withCustomProviderRuntimeEnv<T>(
	selectedModelId: string | null | undefined,
	operation: (prepared: {
		isCustomModel: boolean;
		modelId?: string;
	}) => Promise<T>,
): Promise<T> {
	let releaseCurrentTurn: (() => void) | undefined;
	const waitForTurn = customProviderRuntimeEnvTail;
	customProviderRuntimeEnvTail = new Promise<void>((resolve) => {
		releaseCurrentTurn = resolve;
	});

	await waitForTurn;
	const prepared = prepareCustomProviderRuntimeEnv(selectedModelId);
	try {
		return await operation(prepared);
	} finally {
		clearAppliedCustomProviderRuntimeEnv();
		releaseCurrentTurn?.();
	}
}
