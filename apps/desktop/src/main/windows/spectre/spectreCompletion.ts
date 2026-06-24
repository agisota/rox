/**
 * Spectre AI completion — streams an answer from the Rox gateway
 * (`api.zed.md`, OpenAI-compatible) forced onto **xai/grok-4.3**.
 *
 * Direct `fetch` against the chat-completions endpoint with `stream: true` (no
 * AI-SDK dependency, mirroring apps/api `r1.ts`), parsing the SSE token deltas.
 * When a screenshot is attached it is sent as an OpenAI vision `image_url` part
 * so grok-4.3 can reason about the screen.
 */

/** The model Spectre always uses, regardless of the chat ModelPicker. */
export const SPECTRE_MODEL_ID = "xai/grok-4.3";

const SPECTRE_SYSTEM_PROMPT =
	"Ты — Spectre, невидимый ассистент Rox поверх экрана. Отвечай по-русски, " +
	"кратко и по делу. Если приложен скриншот — опиши только релевантное и дай " +
	"практичный следующий шаг.";

export interface SpectreAskInput {
	prompt: string;
	/** Base64 PNG of the screen for a vision query, or null for text-only. */
	imagePngBase64: string | null;
}

export interface SpectreCompletionDeps {
	baseUrl: string;
	apiKey: string;
	/** Injectable for tests; defaults to global fetch. */
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
}

type ChatContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

function buildUserContent(input: SpectreAskInput): string | ChatContentPart[] {
	if (!input.imagePngBase64) return input.prompt;
	return [
		{ type: "text", text: input.prompt },
		{
			type: "image_url",
			image_url: { url: `data:image/png;base64,${input.imagePngBase64}` },
		},
	];
}

/**
 * Parse one SSE line and return the token delta, `"__DONE__"` for the terminal
 * `[DONE]` sentinel, or null for keep-alives / non-data lines.
 */
export function parseSseLine(line: string): string | "__DONE__" | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return null;
	const payload = trimmed.slice("data:".length).trim();
	if (payload === "[DONE]") return "__DONE__";
	try {
		const json = JSON.parse(payload) as {
			choices?: Array<{ delta?: { content?: string } }>;
		};
		return json.choices?.[0]?.delta?.content ?? null;
	} catch {
		return null;
	}
}

/**
 * Stream the grok-4.3 answer token-by-token. Yields content deltas as they
 * arrive. Throws on a missing key or a non-2xx response so the caller can
 * surface an error to the overlay.
 */
export async function* streamSpectreCompletion(
	input: SpectreAskInput,
	deps: SpectreCompletionDeps,
): AsyncGenerator<string, void, unknown> {
	if (!deps.apiKey) {
		throw new Error("Spectre is not configured (ROX_AI_API_KEY missing).");
	}
	const fetchImpl = deps.fetchImpl ?? fetch;

	const response = await fetchImpl(`${deps.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${deps.apiKey}`,
		},
		signal: deps.signal,
		body: JSON.stringify({
			model: SPECTRE_MODEL_ID,
			stream: true,
			messages: [
				{ role: "system", content: SPECTRE_SYSTEM_PROMPT },
				{ role: "user", content: buildUserContent(input) },
			],
		}),
	});

	if (!response.ok || !response.body) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Spectre completion failed (${response.status}): ${body.slice(0, 300)}`,
		);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		// SSE events are newline-delimited; keep the trailing partial line.
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const token = parseSseLine(line);
			if (token === "__DONE__") return;
			if (token) yield token;
		}
	}
}
