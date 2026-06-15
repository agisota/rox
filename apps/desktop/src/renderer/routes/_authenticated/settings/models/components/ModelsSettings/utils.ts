import {
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL,
	ROX_CHAT_MODEL_ID,
} from "@rox/shared/chat-models";
import {
	type AuthStatusLike,
	deriveModelProviderStatus,
	type ModelProviderStatus,
	type ProviderId,
} from "shared/ai/provider-status";

export type ApiKeyProviderId = Extract<
	ProviderId,
	"groq" | "google" | "deepseek"
>;

export interface ApiKeyProviderConfig {
	id: ApiKeyProviderId;
	title: string;
	description: string;
	apiKeyPlaceholder: string;
	helpText: string;
	iconProvider: string;
}

export const ROX_PROVIDER_STATUS = deriveModelProviderStatus({
	providerId: "rox",
	authStatus: {
		authenticated: true,
		method: "env",
		source: "managed",
		issue: null,
	},
});

export const ROX_PROVIDER_DETAILS = {
	modelId: ROX_CHAT_MODEL_ID,
	baseUrl: ROX_AI_BASE_URL,
	apiKeyEnv: ROX_AI_API_KEY_ENV,
} as const;

export const API_KEY_PROVIDER_CONFIGS = [
	{
		id: "groq",
		title: "Groq",
		description: "Добавьте ключ Groq для запуска моделей Groq.",
		apiKeyPlaceholder: "gsk_...",
		helpText: "Сохраняется в локальном хранилище ключей Rox.",
		iconProvider: "groq",
	},
	{
		id: "google",
		title: "Google Gemini",
		description: "Добавьте ключ Google Gemini для моделей Gemini.",
		apiKeyPlaceholder: "AIza...",
		helpText:
			"Поддерживаются переменные окружения GOOGLE_GENERATIVE_AI_API_KEY, GOOGLE_API_KEY или GEMINI_API_KEY.",
		iconProvider: "google",
	},
	{
		id: "deepseek",
		title: "DeepSeek",
		description: "Добавьте ключ DeepSeek для моделей DeepSeek.",
		apiKeyPlaceholder: "sk-...",
		helpText: "Сохраняется в локальном хранилище ключей Rox.",
		iconProvider: "deepseek",
	},
] satisfies readonly ApiKeyProviderConfig[];

export interface AnthropicFormValues {
	apiKey: string;
	authToken: string;
	baseUrl: string;
	extraEnv: string;
}

export const EMPTY_ANTHROPIC_FORM: AnthropicFormValues = {
	apiKey: "",
	authToken: "",
	baseUrl: "",
	extraEnv: "",
};

export function parseAnthropicForm(envText: string): AnthropicFormValues {
	const lines = envText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const remaining: string[] = [];
	const values = { ...EMPTY_ANTHROPIC_FORM };

	for (const line of lines) {
		const normalized = line.replace(/^export\s+/, "");
		const eqIndex = normalized.indexOf("=");
		if (eqIndex === -1) {
			remaining.push(line);
			continue;
		}

		const key = normalized.slice(0, eqIndex).trim();
		const value = normalized.slice(eqIndex + 1).trim();
		switch (key) {
			case "ANTHROPIC_API_KEY":
				values.apiKey = value;
				break;
			case "ANTHROPIC_AUTH_TOKEN":
				values.authToken = value;
				break;
			case "ANTHROPIC_BASE_URL":
				values.baseUrl = value;
				break;
			default:
				remaining.push(line);
		}
	}

	values.extraEnv = remaining.join("\n");
	return values;
}

export function buildAnthropicEnvText(values: AnthropicFormValues): string {
	const lines = [
		values.apiKey.trim() ? `ANTHROPIC_API_KEY=${values.apiKey.trim()}` : null,
		values.authToken.trim()
			? `ANTHROPIC_AUTH_TOKEN=${values.authToken.trim()}`
			: null,
		values.baseUrl.trim()
			? `ANTHROPIC_BASE_URL=${values.baseUrl.trim()}`
			: null,
		values.extraEnv.trim() ? values.extraEnv.trim() : null,
	].filter((line): line is string => Boolean(line));

	return lines.join("\n");
}

const EXTERNAL_OAUTH_LABELS: Partial<Record<ProviderId, string>> = {
	anthropic: "Connected via Claude",
	openai: "Connected via ChatGPT",
};

export function getProviderSubtitle(
	providerId: ProviderId,
	status: ModelProviderStatus | undefined,
): string {
	if (status?.issue) {
		return status.issue.message;
	}
	if (!status || status.connectionState === "disconnected") {
		return "";
	}
	if (status.source === "external" && status.authMethod === "oauth") {
		return EXTERNAL_OAUTH_LABELS[providerId] ?? "Connected outside Rox";
	}
	if (status.authMethod === "oauth") {
		return "Connected in Rox";
	}
	if (status.authMethod === "api_key" || status.authMethod === "env") {
		return "Connected with API key";
	}
	return "Connected";
}

export function getStatusBadge(
	status: ModelProviderStatus | undefined,
): { label: string; variant: "secondary" | "outline" | "destructive" } | null {
	if (!status || status.connectionState === "disconnected") {
		return { label: "Not connected", variant: "outline" };
	}
	if (status.issue?.code === "expired") {
		return { label: "Expired", variant: "destructive" };
	}
	if (status.issue) {
		return { label: "Needs attention", variant: "outline" };
	}
	if (status.connectionState === "connected") {
		return { label: "Active", variant: "secondary" };
	}
	return null;
}

export function resolveProviderStatus(params: {
	providerId: ProviderId;
	authStatus?: AuthStatusLike;
}): ModelProviderStatus | undefined {
	const { providerId, authStatus } = params;
	if (!authStatus) return undefined;
	return deriveModelProviderStatus({ providerId, authStatus });
}

export type ProviderAction =
	| { kind: "connect" }
	| { kind: "reconnect" }
	| { kind: "logout" }
	| null;

/**
 * Single source of truth for the provider action button.
 */
export function getProviderAction(
	status: ModelProviderStatus | undefined,
): ProviderAction {
	if (!status || status.connectionState === "disconnected") {
		return { kind: "connect" };
	}
	if (status.issue?.remediation === "reconnect") {
		return { kind: "reconnect" };
	}
	if (status.connectionState === "connected") {
		return { kind: "logout" };
	}
	return { kind: "connect" };
}
