/**
 * Dictated-prompt post-processing — voice-dictation epic.
 *
 * Takes a raw Whisper transcript and asks Groq Compound (the R1-equivalent house
 * model) to improve it — paragraphs, formatting, composition, granularity and
 * detail — preserving the user's intent without inventing facts, and returns it
 * in both Russian and English.
 */

import { resolveGroqKey } from "./whisper";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const CHAT_MODEL = "groq/compound";

const SYSTEM_PROMPT = `Ты улучшаешь промпт, который пользователь надиктовал голосом для AI-агента. Сохрани исходный смысл и намерение, ничего не выдумывая, но улучши формулировку:
- разбей на логичные абзацы и аккуратно отформатируй;
- улучши композицию, структуру и читаемость;
- повысь гранулярность и детализацию: добавь уместные детали, нюансы и аспекты, которые делают команду точнее и исполнимее;
- убери оговорки, слова-паразиты и артефакты распознавания речи.

Верни СТРОГО JSON-объект без markdown по схеме:
{ "ru": "улучшенный промпт на русском", "en": "the same improved prompt in English" }
Только JSON-объект.`;

export interface ProcessedPrompt {
	ru: string;
	en: string;
}

/** Extract the outermost JSON object from a model reply (fences/prose tolerant). */
export function parseJsonObject<T>(raw: string): T {
	const unfenced = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	const start = unfenced.indexOf("{");
	const end = unfenced.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error("Post-process reply is not a JSON object");
	}
	return JSON.parse(unfenced.slice(start, end + 1)) as T;
}

/**
 * Build the system prompt, optionally appending the user's pre-supplied context
 * so the model can resolve names, jargon and intent it would otherwise miss.
 * The context is reference-only — it must never be echoed or invented into the
 * output, only used to disambiguate the transcript.
 */
export function buildSystemPrompt(userContext?: string): string {
	const context = userContext?.trim();
	if (!context) return SYSTEM_PROMPT;
	return `${SYSTEM_PROMPT}

Контекст от пользователя (задан заранее, используй для понимания терминов, имён и намерений; НЕ копируй его в ответ и ничего не выдумывай на его основе):
${context}`;
}

/**
 * Post-process a transcript into formatted RU + EN prompts. Returns null when no
 * Groq key is configured, the input is empty, or the model fails — callers fall
 * back to the raw transcript so dictation never hard-fails on post-processing.
 *
 * `userContext` is optional free-text the user supplied in advance (Settings →
 * Voice → "Контекст для агента"); when present it is appended to the system
 * prompt so the model has the user's context.
 */
export async function postprocessPrompt(
	rawText: string,
	userContext?: string,
): Promise<ProcessedPrompt | null> {
	const key = resolveGroqKey();
	if (!key || rawText.trim().length === 0) return null;

	let response: Response;
	try {
		response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: CHAT_MODEL,
				messages: [
					{ role: "system", content: buildSystemPrompt(userContext) },
					{ role: "user", content: rawText },
				],
				temperature: 0.3,
				max_tokens: 2_048,
			}),
		});
	} catch {
		return null;
	}
	if (!response.ok) return null;

	try {
		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) return null;
		const parsed = parseJsonObject<{ ru?: unknown; en?: unknown }>(content);
		const ru = String(parsed?.ru ?? "").trim();
		const en = String(parsed?.en ?? "").trim();
		if (!ru && !en) return null;
		return { ru: ru || rawText, en: en || rawText };
	} catch {
		return null;
	}
}
