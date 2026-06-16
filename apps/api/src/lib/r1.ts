/**
 * Rox R1 server-side generation helper — journal-memory epic.
 *
 * Daily Journal/Memory jobs run on the API server (the desktop may be closed),
 * so they cannot use the host-service's per-user Rox key path. This helper calls
 * an OpenAI-compatible chat-completions endpoint directly via `fetch` — no
 * AI-SDK dependency. It prefers the Rox gateway (ROX_AI_API_KEY → api.zed.md,
 * the free house R1) and falls back to direct Groq Compound (GROQ_API_KEY).
 */

import { resolveRoxBaseUrl, resolveRoxModelId } from "@rox/shared/chat-models";
import { env } from "@/env";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_COMPOUND_MODEL = "groq/compound";

export type R1Provider = "rox-gateway" | "groq";

export interface R1Config {
	baseUrl: string;
	apiKey: string;
	model: string;
	provider: R1Provider;
}

export interface R1Message {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface R1CallOptions {
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
}

export class R1NotConfiguredError extends Error {
	constructor() {
		super("Rox R1 is not configured (set ROX_AI_API_KEY or GROQ_API_KEY).");
		this.name = "R1NotConfiguredError";
	}
}

/**
 * Resolve which R1 backend to use. The Rox gateway wins when `ROX_AI_API_KEY` is
 * set (free house model, per-deploy shared key); otherwise direct Groq Compound.
 * Returns `null` when neither credential is configured so callers can skip
 * generation gracefully rather than throwing.
 */
export function resolveR1Config(): R1Config | null {
	const roxKey = env.ROX_AI_API_KEY?.trim();
	if (roxKey) {
		return {
			baseUrl: resolveRoxBaseUrl(process.env),
			apiKey: roxKey,
			model: resolveRoxModelId(process.env),
			provider: "rox-gateway",
		};
	}
	const groqKey = env.GROQ_API_KEY?.trim();
	if (groqKey) {
		return {
			baseUrl: GROQ_BASE_URL,
			apiKey: groqKey,
			model: env.ROX_AI_MODEL?.trim() || GROQ_COMPOUND_MODEL,
			provider: "groq",
		};
	}
	return null;
}

/** True when at least one R1 backend credential is configured. */
export function isR1Configured(): boolean {
	return resolveR1Config() !== null;
}

interface ChatCompletionResponse {
	choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Call R1 and return the raw assistant message text. Throws
 * {@link R1NotConfiguredError} when no backend is configured, or a plain Error on
 * a non-2xx response / network failure / empty completion.
 */
export async function callR1(
	messages: R1Message[],
	opts: R1CallOptions = {},
): Promise<string> {
	const config = resolveR1Config();
	if (!config) throw new R1NotConfiguredError();

	const response = await fetch(`${config.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
		},
		signal: opts.signal,
		body: JSON.stringify({
			model: config.model,
			messages,
			temperature: opts.temperature ?? 0.4,
			...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`R1 request failed (${config.provider} ${response.status}): ${body.slice(0, 500)}`,
		);
	}

	const data = (await response.json()) as ChatCompletionResponse;
	const content = data.choices?.[0]?.message?.content;
	if (typeof content !== "string" || content.trim().length === 0) {
		throw new Error(`R1 returned an empty completion (${config.provider}).`);
	}
	return content;
}

/**
 * Call R1 expecting a JSON object reply and parse it. The system prompt should
 * instruct strict-JSON output. Tolerates ```json fences and surrounding prose by
 * extracting the outermost balanced `{...}` block.
 */
export async function callR1Json<T>(
	messages: R1Message[],
	opts: R1CallOptions = {},
): Promise<T> {
	const raw = await callR1(messages, opts);
	return parseJsonObject<T>(raw);
}

/**
 * Extract and parse the outermost JSON object from a model reply. Strips ```json
 * fences and any prose before the first `{` / after the last `}`. Throws when no
 * object-shaped slice is present or the slice is invalid JSON.
 */
export function parseJsonObject<T>(raw: string): T {
	const unfenced = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	const start = unfenced.indexOf("{");
	const end = unfenced.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error(`R1 reply is not a JSON object: ${raw.slice(0, 200)}`);
	}
	return JSON.parse(unfenced.slice(start, end + 1)) as T;
}
