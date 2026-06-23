import {
	type CustomProviderConfig,
	getCustomProviderConfig,
	stripCustomProviderPrefix,
	toCustomProviderWireModelId,
} from "../../../desktop/chat-service/custom-provider-config";

/**
 * Detect when the selected chat model belongs to the user's custom
 * OpenAI-compatible provider and resolve its harness wire id
 * (`<slug>/<modelId>`). The provider is registered in mastracode's global
 * `settings.json` (written by `setCustomProviderConfig`), so the harness routes
 * the wire id through its OpenAI-compatible chat-completions client. No process
 * env is injected here — the settings.json registration is the bridge, and the
 * old `OPENAI_*` injection forced the `/responses` path and could clobber real
 * OpenAI auth.
 */

let customProviderRuntimeEnvTail = Promise.resolve();

/**
 * True when `selectedModelId` (bare, `rox-custom/`-prefixed, or a stray legacy
 * `openai/`-prefixed id) refers to one of the configured custom-provider models.
 */
function isCustomProviderModel(
	selectedModelId: string | null | undefined,
	config: CustomProviderConfig,
): boolean {
	if (!selectedModelId) return false;
	const normalized = stripCustomProviderPrefix(
		selectedModelId.trim(),
	).toLowerCase();
	return config.models.some(
		(model) => model.trim().toLowerCase() === normalized,
	);
}

function resolveCustomProviderConfigForModel(
	selectedModelId: string | null | undefined,
): CustomProviderConfig | null {
	const config = getCustomProviderConfig();
	if (!config) return null;
	return isCustomProviderModel(selectedModelId, config) ? config : null;
}

export function resolveCustomProviderRuntimeModelId(
	selectedModelId: string | null | undefined,
): string | undefined {
	const trimmed = selectedModelId?.trim();
	if (!trimmed) return undefined;

	const config = resolveCustomProviderConfigForModel(trimmed);
	return config ? toCustomProviderWireModelId(trimmed) : trimmed;
}

export function prepareCustomProviderRuntimeEnv(
	selectedModelId: string | null | undefined,
): { isCustomModel: boolean; modelId?: string } {
	const trimmed = selectedModelId?.trim();
	if (!trimmed) {
		return { isCustomModel: false };
	}

	const config = resolveCustomProviderConfigForModel(trimmed);
	if (!config) {
		return { isCustomModel: false, modelId: trimmed };
	}

	return {
		isCustomModel: true,
		modelId: toCustomProviderWireModelId(trimmed),
	};
}

export async function withCustomProviderRuntimeEnv<T>(
	selectedModelId: string | null | undefined,
	operation: (prepared: {
		isCustomModel: boolean;
		modelId?: string;
	}) => Promise<T>,
): Promise<T> {
	// Serialize turns so the wire-id resolution observed by `operation` is stable
	// even when overlapping turns prepare different models. No env is mutated, but
	// keeping the queue preserves the previous ordering guarantees callers rely on.
	let releaseCurrentTurn: (() => void) | undefined;
	const waitForTurn = customProviderRuntimeEnvTail;
	customProviderRuntimeEnvTail = new Promise<void>((resolve) => {
		releaseCurrentTurn = resolve;
	});

	await waitForTurn;
	try {
		const prepared = prepareCustomProviderRuntimeEnv(selectedModelId);
		return await operation(prepared);
	} finally {
		releaseCurrentTurn?.();
	}
}
