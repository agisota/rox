export interface ChatModelOption {
	id: string;
	name: string;
	provider: string;
}

export const ROX_CHAT_PROVIDER = "Rox";
/**
 * Catalog / selection id for the Rox house model. This is the id carried in
 * chat message metadata when the user picks "ROX R1". The underlying model is
 * `compound` (routed via {@link ROX_AI_BASE_URL}); the per-user key is injected
 * server-side. This id is never shown in the UI — every surface renders
 * {@link ROX_CHAT_MODEL_NAME} ("ROX R1") instead.
 *
 * Different layers historically spelled this `compound`, `rox-r1`, or `r1`;
 * {@link resolveChatWireModelId} reconciles every spelling to one canonical
 * wire id ({@link ROX_CHAT_WIRE_MODEL_ID}).
 */
export const ROX_CHAT_MODEL_ID = "compound";
/**
 * The wire model id handed to the mastracode harness for the Rox house model.
 *
 * mastracode routes a bare id (e.g. `compound`) through its Mastra gateway,
 * which has no Rox credential. Prefixing with `openai/` makes mastracode resolve
 * it through the OpenAI-compatible client, which reads `OPENAI_BASE_URL`
 * ({@link ROX_AI_BASE_URL}) + `OPENAI_API_KEY` (the per-user Rox key) from the
 * runtime env. So the host-service points the OpenAI-compatible client at Rox
 * and the harness asks it for `compound`.
 */
export const ROX_CHAT_WIRE_MODEL_ID = "openai/compound";
/** User-facing display name. The only Rox model label shown anywhere. */
export const ROX_CHAT_MODEL_NAME = "ROX R1";
export const ROX_AI_BASE_URL = "https://api.zed.md/v1";
export const ROX_AI_API_KEY_ENV = "ROX_AI_API_KEY";
/**
 * Optional per-user key provisioning endpoint. When set, the host-service mints
 * (or fetches) a per-user Rox key from this URL instead of relying on a
 * statically-provided {@link ROX_AI_API_KEY_ENV}. Authenticated with
 * {@link ROX_KEY_PROVISION_TOKEN_ENV}.
 */
export const ROX_KEY_PROVISION_URL_ENV = "ROX_KEY_PROVISION_URL";
/** Admin/bearer credential used to authenticate against the provisioning URL. */
export const ROX_KEY_PROVISION_TOKEN_ENV = "ROX_KEY_PROVISION_TOKEN";

/**
 * Every accepted spelling of the Rox house model id, lowercased. Any of these,
 * with or without an `openai/` prefix, resolves to {@link ROX_CHAT_WIRE_MODEL_ID}.
 */
const ROX_CHAT_MODEL_ALIASES: ReadonlySet<string> = new Set([
	"compound",
	"rox-r1",
	"r1",
	ROX_CHAT_MODEL_NAME.toLowerCase(),
]);

function stripOpenAIPrefix(modelId: string): string {
	return modelId.startsWith("openai/")
		? modelId.slice("openai/".length)
		: modelId;
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

/**
 * Reconcile any Rox model spelling to the canonical wire id the harness needs.
 * Non-Rox ids pass through unchanged (already provider-prefixed, e.g.
 * `anthropic/claude-opus-4-8`), trimmed of surrounding whitespace.
 */
export function resolveChatWireModelId(modelId: string): string {
	const trimmed = modelId.trim();
	return isRoxHouseModel(trimmed) ? ROX_CHAT_WIRE_MODEL_ID : trimmed;
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
