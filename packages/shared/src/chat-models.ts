export interface ChatModelOption {
	id: string;
	name: string;
	provider: string;
}

export const ROX_CHAT_PROVIDER = "Rox";

/** Env var holding the OpenAI-compatible base URL for the Rox house model. */
export const ROX_AI_BASE_URL_ENV = "ROX_AI_BASE_URL";
/** Env var holding the shared / per-user Rox API key. */
export const ROX_AI_API_KEY_ENV = "ROX_AI_API_KEY";
/** Env var holding the upstream model id the Rox gateway exposes. */
export const ROX_AI_MODEL_ENV = "ROX_AI_MODEL";

/**
 * Default OpenAI-compatible endpoint for the Rox house model. The live gateway
 * at this URL exposes a model literally named {@link ROX_DEFAULT_MODEL_ID}.
 * Overridable at runtime via {@link ROX_AI_BASE_URL_ENV} so the same build can
 * be pointed at a different gateway without a code change.
 */
export const ROX_AI_BASE_URL = "https://api.zed.md/v1";
/**
 * Default upstream model id the Rox gateway serves. The live gateway exposes
 * this exact id (`r1`) over its OpenAI-compatible surface. Overridable via
 * {@link ROX_AI_MODEL_ENV}.
 */
export const ROX_DEFAULT_MODEL_ID = "r1";

/**
 * Catalog / selection id for the Rox house model. This is the id carried in
 * chat message metadata when the user picks "ROX R1". The underlying model is
 * `r1` (routed via {@link ROX_AI_BASE_URL}); the API key is injected
 * server-side. This id is never shown in the UI — every surface renders
 * {@link ROX_CHAT_MODEL_NAME} ("ROX R1") instead.
 *
 * Different layers historically spelled this `compound`, `rox-r1`, or `r1`;
 * {@link resolveRoxWireModelId} / {@link resolveChatWireModelId} reconcile every
 * spelling to one canonical wire id that selects the OpenAI-compatible client
 * and sends the real upstream id to the gateway.
 */
export const ROX_CHAT_MODEL_ID = ROX_DEFAULT_MODEL_ID;
/** Provider prefix that routes a model through the OpenAI-compatible client. */
const OPENAI_PROVIDER_PREFIX = "openai/";
/**
 * The default wire model id handed to the mastracode harness for the Rox house
 * model when no {@link ROX_AI_MODEL_ENV} override is set.
 *
 * mastracode routes a bare id (e.g. `r1`) through its Mastra gateway, which has
 * no Rox credential. Prefixing with `openai/` makes mastracode resolve it
 * through the OpenAI-compatible client, which reads `OPENAI_BASE_URL`
 * ({@link ROX_AI_BASE_URL}) + `OPENAI_API_KEY` (the Rox key) from the runtime
 * env. mastracode strips the leading `openai/` before calling the gateway, so
 * api.zed.md receives the bare model id `r1`.
 */
export const ROX_CHAT_WIRE_MODEL_ID = `${OPENAI_PROVIDER_PREFIX}${ROX_DEFAULT_MODEL_ID}`;
/** User-facing display name. The only Rox model label shown anywhere. */
export const ROX_CHAT_MODEL_NAME = "ROX R1";

/**
 * Optional per-user key provisioning endpoint. When set, the host-service mints
 * (or fetches) a per-user Rox key from this URL instead of relying on a
 * statically-provided {@link ROX_AI_API_KEY_ENV}. Authenticated with
 * {@link ROX_KEY_PROVISION_TOKEN_ENV}.
 *
 * This is strictly optional: a directly-set {@link ROX_AI_API_KEY_ENV} is the
 * primary (shared-key MVP) path and short-circuits provisioning entirely.
 */
export const ROX_KEY_PROVISION_URL_ENV = "ROX_KEY_PROVISION_URL";
/** Admin/bearer credential used to authenticate against the provisioning URL. */
export const ROX_KEY_PROVISION_TOKEN_ENV = "ROX_KEY_PROVISION_TOKEN";

/**
 * Every accepted spelling of the Rox house model id, lowercased. Any of these,
 * with or without an `openai/` prefix, is recognised as the Rox house model.
 * `compound` is retained for backward compatibility with older clients/metadata
 * that may still carry it.
 */
const ROX_CHAT_MODEL_ALIASES: ReadonlySet<string> = new Set([
	"r1",
	"rox-r1",
	"compound",
	ROX_CHAT_MODEL_NAME.toLowerCase(),
]);

function stripOpenAIPrefix(modelId: string): string {
	return modelId.startsWith(OPENAI_PROVIDER_PREFIX)
		? modelId.slice(OPENAI_PROVIDER_PREFIX.length)
		: modelId;
}

function trimToNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * True when `modelId` (in any accepted spelling) refers to the Rox house model.
 * Tolerant of surrounding whitespace, case, and an `openai/` prefix.
 */
export function isRoxHouseModel(modelId: string | null | undefined): boolean {
	if (!modelId) return false;
	const normalized = stripOpenAIPrefix(modelId.trim().toLowerCase());
	return ROX_CHAT_MODEL_ALIASES.has(normalized);
}

/** Read-only env accessor used by the runtime resolvers below. */
export type ChatModelEnvSource = Record<string, string | undefined>;

function readEnv(env?: ChatModelEnvSource): ChatModelEnvSource {
	if (env) return env;
	if (typeof process !== "undefined" && process.env) return process.env;
	return {};
}

/**
 * Resolve the OpenAI-compatible base URL for the Rox house model. Reads
 * {@link ROX_AI_BASE_URL_ENV} and falls back to {@link ROX_AI_BASE_URL}.
 */
export function resolveRoxBaseUrl(env?: ChatModelEnvSource): string {
	return trimToNull(readEnv(env)[ROX_AI_BASE_URL_ENV]) ?? ROX_AI_BASE_URL;
}

/**
 * Resolve the bare upstream model id the Rox gateway should receive. Reads
 * {@link ROX_AI_MODEL_ENV} and falls back to {@link ROX_DEFAULT_MODEL_ID}. Any
 * incoming `openai/` prefix is stripped so the gateway gets a bare id.
 */
export function resolveRoxModelId(env?: ChatModelEnvSource): string {
	const configured = trimToNull(readEnv(env)[ROX_AI_MODEL_ENV]);
	return configured ? stripOpenAIPrefix(configured) : ROX_DEFAULT_MODEL_ID;
}

/**
 * Resolve the canonical wire id handed to `harness.switchModel` for the Rox
 * house model: `openai/<ROX_AI_MODEL|r1>`. The `openai/` prefix selects the
 * OpenAI-compatible client; mastracode strips it before calling the gateway, so
 * the gateway receives the bare {@link resolveRoxModelId} value.
 */
export function resolveRoxWireModelId(env?: ChatModelEnvSource): string {
	return `${OPENAI_PROVIDER_PREFIX}${resolveRoxModelId(env)}`;
}

/**
 * Reconcile any chat model spelling to the wire id the harness needs.
 *
 * For the Rox house model this returns {@link resolveRoxWireModelId} (env-aware,
 * `openai/<r1>`). Non-Rox ids pass through unchanged (already provider-prefixed,
 * e.g. `anthropic/claude-opus-4-8`), trimmed of surrounding whitespace.
 */
export function resolveChatWireModelId(
	modelId: string,
	env?: ChatModelEnvSource,
): string {
	const trimmed = modelId.trim();
	return isRoxHouseModel(trimmed) ? resolveRoxWireModelId(env) : trimmed;
}

export const ROX_CHAT_MODEL: ChatModelOption = {
	id: ROX_CHAT_MODEL_ID,
	name: ROX_CHAT_MODEL_NAME,
	provider: ROX_CHAT_PROVIDER,
};

export const AVAILABLE_CHAT_MODELS: readonly ChatModelOption[] = [
	ROX_CHAT_MODEL,
	{
		id: "anthropic/claude-opus-4-8",
		name: "Opus 4.8",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-opus-4-7",
		name: "Opus 4.7",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-fable-5",
		name: "Fable 5",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		name: "Sonnet 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		name: "Haiku 4.5",
		provider: "Anthropic",
	},
	{
		id: "openai/gpt-5.5",
		name: "GPT-5.5",
		provider: "OpenAI",
	},
	{
		id: "openai/gpt-5.4",
		name: "GPT-5.4",
		provider: "OpenAI",
	},
	{
		id: "openai/gpt-5.3-codex",
		name: "GPT-5.3 Codex",
		provider: "OpenAI",
	},
	{
		id: "groq/llama-3.3-70b-versatile",
		name: "Llama 3.3 70B Versatile",
		provider: "Groq",
	},
	{
		id: "google/gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		provider: "Google Gemini",
	},
	{
		id: "google/gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		provider: "Google Gemini",
	},
	{
		id: "deepseek/deepseek-chat",
		name: "DeepSeek Chat",
		provider: "DeepSeek",
	},
	{
		id: "deepseek/deepseek-reasoner",
		name: "DeepSeek Reasoner",
		provider: "DeepSeek",
	},
];
