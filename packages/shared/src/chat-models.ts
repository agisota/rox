export interface ChatModelOption {
	id: string;
	name: string;
	provider: string;
}

export const ROX_CHAT_PROVIDER = "Rox";
/**
 * The wire model id sent to the OpenAI-compatible backend. The underlying model
 * is `compound` (routed via {@link ROX_AI_BASE_URL}); the per-user key is
 * injected server-side. This id is never shown in the UI — every surface
 * renders {@link ROX_CHAT_MODEL_NAME} ("ROX R1") instead.
 */
export const ROX_CHAT_MODEL_ID = "compound";
/** User-facing display name. The only Rox model label shown anywhere. */
export const ROX_CHAT_MODEL_NAME = "ROX R1";
export const ROX_AI_BASE_URL = "https://api.zed.md/v1";
export const ROX_AI_API_KEY_ENV = "ROX_AI_API_KEY";

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
