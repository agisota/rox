/**
 * Quick-chat completion helpers — WS-G (Быстрый чат → R1).
 *
 * The desktop "Быстрый чат" calls `chat.complete` (this file backs it) instead
 * of the durable-streams agent loop the project chat uses. It talks to an
 * OpenAI-compatible `/chat/completions` endpoint directly via `fetch` — no
 * AI-SDK / mastracode dependency — so a single server-side key answers as
 * "ROX R1" for every user without a per-user provider key.
 *
 * Model resolution goes through `@rox/shared/chat-models`: the picker carries a
 * stable selection id (e.g. `rox-r1`), `resolveChatWireModelId` reconciles it to
 * the wire id, and for the Rox house model we strip the `openai/` prefix and send
 * the bare upstream combo id (`top`) to the gateway. Non-Rox ids (Opus/GPT/…)
 * need a per-user provider key the server doesn't hold on this path, so the
 * procedure returns a typed "needs-user-key" result rather than failing — the UI
 * shows an inline note while ROX R1 keeps working.
 *
 * Persistence reuses the same durable-streams transcript the Журнал reads
 * (`session-transcript.ts` extracts `content` fields from NDJSON lines), so quick
 * chats become journal-summarizable. Persistence is best-effort: a transcript
 * write failure never fails the user's reply.
 */

import {
	type ChatModelEnvSource,
	isRoxHouseModel,
	ROX_CHAT_MODEL_ID,
	resolveChatWireModelId,
	resolveRoxBaseUrl,
} from "@rox/shared/chat-models";
import {
	buildLabelPrompt,
	LABEL_SUGGESTION_INSTRUCTIONS,
	parseSuggestedLabels,
	type TranscriptTurn,
} from "../label-suggestion";

/**
 * Read a runtime secret lazily from `process.env`.
 *
 * Mirrors `voice/postprocess.ts`: this file is unit-tested, so it must not import
 * the eager-validated `@t3-oss/env-core` `env` (that throws at import time when a
 * test shell lacks unrelated required vars like LINEAR_CLIENT_ID). The vars below
 * are declared (optional) in `packages/trpc/src/env.ts` for typing/documentation;
 * here we read them lazily so the helper stays importable in any environment.
 */
function readSecret(name: string): string | undefined {
	const value = process.env[name];
	const trimmed = typeof value === "string" ? value.trim() : "";
	return trimmed.length > 0 ? trimmed : undefined;
}

/** One chat turn exchanged with the model / persisted to the transcript. */
export interface ChatCompletionMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/** Outcome of a quick-chat completion attempt. */
export type ChatCompletionResult =
	| { status: "ok"; reply: string }
	| { status: "needs-user-key" }
	| { status: "not-configured" };

interface OpenAIChatCompletionResponse {
	choices?: Array<{ message?: { content?: string } }>;
}

const OPENAI_PROVIDER_PREFIX = "openai/";

/**
 * Strip a leading `openai/` so the OpenAI-compatible gateway receives a bare
 * upstream model id (mastracode does the same before calling api.zed.md).
 */
function toBareWireModelId(wireModelId: string): string {
	return wireModelId.startsWith(OPENAI_PROVIDER_PREFIX)
		? wireModelId.slice(OPENAI_PROVIDER_PREFIX.length)
		: wireModelId;
}

/**
 * Resolve the base URL + bearer key + bare model id for a quick-chat request.
 *
 * Only the Rox house model is server-key-backed here: it uses the shared
 * `ROX_AI_API_KEY` against the Rox gateway. Any other model id would need a
 * per-user provider key (not available on this server path), so it resolves to
 * `null` and the caller returns a `needs-user-key` result.
 */
function resolveQuickChatTarget(
	modelId: string,
	envSource: ChatModelEnvSource,
):
	| { kind: "rox"; baseUrl: string; apiKey: string; model: string }
	| { kind: "needs-user-key" }
	| { kind: "not-configured" } {
	if (!isRoxHouseModel(modelId)) {
		return { kind: "needs-user-key" };
	}
	const apiKey = readSecret("ROX_AI_API_KEY");
	if (!apiKey) {
		return { kind: "not-configured" };
	}
	const wire = resolveChatWireModelId(modelId, envSource);
	return {
		kind: "rox",
		baseUrl: resolveRoxBaseUrl(envSource),
		apiKey,
		model: toBareWireModelId(wire),
	};
}

/** Map the abstract reasoning level to a sampling temperature. */
function temperatureForReasoning(reasoning: string | undefined): number {
	switch (reasoning) {
		case "high":
			return 0.2;
		case "low":
			return 0.6;
		default:
			return 0.4;
	}
}

export interface RunQuickChatOptions {
	modelId: string;
	messages: ChatCompletionMessage[];
	reasoning?: string;
	maxTokens?: number;
	signal?: AbortSignal;
	/** Env override (tests inject a stub; defaults to `process.env`). */
	envSource?: ChatModelEnvSource;
}

/**
 * Run a non-streaming quick-chat completion. Returns the full assistant reply,
 * or a typed result when the model needs a per-user key / no Rox key is set.
 * Throws only on a genuine gateway/network failure with a configured Rox key so
 * the caller can surface a real error.
 */
export async function runQuickChatCompletion(
	opts: RunQuickChatOptions,
): Promise<ChatCompletionResult> {
	const envSource = opts.envSource ?? process.env;
	const target = resolveQuickChatTarget(opts.modelId, envSource);
	if (target.kind === "needs-user-key") return { status: "needs-user-key" };
	if (target.kind === "not-configured") return { status: "not-configured" };

	const response = await fetch(`${target.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${target.apiKey}`,
		},
		signal: opts.signal,
		body: JSON.stringify({
			model: target.model,
			messages: opts.messages,
			temperature: temperatureForReasoning(opts.reasoning),
			...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Quick-chat request failed (${response.status}): ${body.slice(0, 500)}`,
		);
	}

	const data = (await response.json()) as OpenAIChatCompletionResponse;
	const content = data.choices?.[0]?.message?.content;
	if (typeof content !== "string" || content.trim().length === 0) {
		throw new Error("Quick-chat returned an empty completion.");
	}
	return { status: "ok", reply: content };
}

/**
 * Suggest 1–3 short topical labels from a chat transcript (F14 — AI auto-tags).
 *
 * Mirrors the auto-title pipeline but on the *organization* tag axis: it runs a
 * single non-streaming completion against the Rox house model (the shared
 * server key — one backend for every web/desktop/mobile client, no per-user
 * provider key), then parses the reply into ≤3 normalized label names via
 * {@link parseSuggestedLabels}. Reconcile against the session's manual labels is
 * the caller's job (`reconcileSuggestions`), so this stays a pure "ask the
 * model" step.
 *
 * Returns an empty array (never throws) when the transcript is empty or the Rox
 * key is unset — label suggestion is an additive enrichment that must never
 * break the chat flow (mirrors `persistQuickChatTurns`' best-effort contract).
 * A genuine gateway failure surfaces as a thrown error the caller logs+swallows.
 */
export async function generateLabelsFromTranscript(args: {
	turns: TranscriptTurn[];
	signal?: AbortSignal;
	envSource?: ChatModelEnvSource;
}): Promise<string[]> {
	const prompt = buildLabelPrompt(args.turns);
	if (!prompt) {
		return [];
	}

	const result = await runQuickChatCompletion({
		modelId: ROX_CHAT_MODEL_ID,
		messages: [
			{ role: "system", content: LABEL_SUGGESTION_INSTRUCTIONS },
			{ role: "user", content: prompt },
		],
		// Deterministic extraction — keep the model on-task, not creative.
		reasoning: "high",
		maxTokens: 64,
		signal: args.signal,
		envSource: args.envSource,
	});

	if (result.status !== "ok") {
		// No Rox key / needs a per-user key on this path — no suggestions, no error.
		return [];
	}
	return parseSuggestedLabels(result.reply);
}

/**
 * Derive a session title from the first user message: a single trimmed line,
 * capped to 80 chars. Falls back to a RU default when the text is empty.
 */
export function deriveSessionTitle(firstUserMessage: string): string {
	const firstLine = firstUserMessage.split(/\r?\n/, 1)[0]?.trim() ?? "";
	if (firstLine.length === 0) return "Быстрый чат";
	return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

const PERSIST_MAX_TURN_CHARS = 16_000;

/** Truncate a turn before persisting so one huge paste can't bloat the stream. */
function clampTurnContent(content: string): string {
	return content.length > PERSIST_MAX_TURN_CHARS
		? `${content.slice(0, PERSIST_MAX_TURN_CHARS)}…`
		: content;
}

/**
 * Append the user turn + assistant reply to the session's durable-streams
 * transcript in the journal-readable NDJSON shape (`{role,content}` per line, the
 * `content` field is what `session-transcript.ts` extracts).
 *
 * Best-effort: returns `false` (never throws) when durable-streams is
 * unconfigured or the append fails, so transcript persistence can't break the
 * user's reply. The `chat_sessions` row + reply are the source of truth; the
 * transcript is an additive enrichment the Журнал consumes.
 */
export async function persistQuickChatTurns(args: {
	sessionId: string;
	userMessage: string;
	assistantMessage: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const baseUrl = readSecret("DURABLE_STREAMS_URL");
	const secret = readSecret("DURABLE_STREAMS_SECRET");
	if (!baseUrl || !secret) return false;

	const streamUrl = `${baseUrl}/sessions/${args.sessionId}`;
	const body = `${[
		{ role: "user", content: clampTurnContent(args.userMessage) },
		{ role: "assistant", content: clampTurnContent(args.assistantMessage) },
	]
		.map((turn) => JSON.stringify(turn))
		.join("\n")}\n`;

	try {
		const response = await fetch(streamUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${secret}`,
				"Content-Type": "application/x-ndjson",
			},
			body,
			signal: args.signal,
		});
		return response.ok;
	} catch {
		return false;
	}
}
