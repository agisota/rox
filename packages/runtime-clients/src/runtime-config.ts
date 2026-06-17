import { type AiProviderKind, aiProviderKindValues } from "@rox/db/enums";

export const DEFAULT_EMBEDDING_DIM = 384;
export const DEFAULT_EMBEDDING_VERSION = 1;

function readPositiveIntegerEnv(
	env: NodeJS.ProcessEnv,
	name: string,
	defaultValue: number,
): number {
	const raw = env[name];
	if (raw === undefined || raw.trim() === "") {
		return defaultValue;
	}

	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

export function readEmbeddingDim(env: NodeJS.ProcessEnv = process.env): number {
	return readPositiveIntegerEnv(env, "EMBEDDING_DIM", DEFAULT_EMBEDDING_DIM);
}

export function readEmbeddingVersion(
	env: NodeJS.ProcessEnv = process.env,
): number {
	return readPositiveIntegerEnv(
		env,
		"EMBEDDING_VERSION",
		DEFAULT_EMBEDDING_VERSION,
	);
}

export function readEmbeddingProvider(
	env: NodeJS.ProcessEnv = process.env,
): AiProviderKind {
	const raw = env.EMBEDDING_PROVIDER;
	if (raw === undefined || raw.trim() === "") {
		return "local";
	}
	if (aiProviderKindValues.includes(raw as AiProviderKind)) {
		return raw as AiProviderKind;
	}
	throw new Error(
		`EMBEDDING_PROVIDER must be one of ${aiProviderKindValues.join(", ")}`,
	);
}
