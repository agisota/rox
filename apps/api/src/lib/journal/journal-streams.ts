/**
 * Journal stream shapes + pure transforms — journal-memory epic.
 *
 * Deliberately free of any `@rox/db/client` import so it can be unit-tested
 * without a database connection. The db-dependent orchestration lives in
 * `journal-generation.ts`.
 */

import {
	type JournalMemorySuggestion,
	type MemoryCategory,
	memoryCategoryValues,
} from "@rox/db/schema";

export const MAX_SESSIONS_PER_DAY = 40;
export const MAX_TRANSCRIPT_CHARS_PER_SESSION = 12_000;

export interface JournalStreams {
	reflection: string;
	learnings: Array<{ text: string }>;
	memorySuggestions: JournalMemorySuggestion[];
	tips: Array<{ text: string }>;
}

export const JOURNAL_SYSTEM_PROMPT = `Ты — рефлексивный ассистент Rox. На вход ты получаешь транскрипты рабочих сессий пользователя за один день. Сгенерируй журнальную запись на русском языке из ЧЕТЫРЁХ потоков.

Верни СТРОГО JSON-объект без markdown и без текста вне JSON, по схеме:
{
  "reflection": "связная рефлексия дня в 2–4 предложениях: над чем работал, какова динамика и настроение",
  "learnings": [{ "text": "конкретный вывод или инсайт, извлечённый из сессий" }],
  "memorySuggestions": [{ "body": "факт, предпочтение или правило, достойное запоминания", "category": "projects|identity|instructions|career|general" }],
  "tips": [{ "text": "практический совет, лайфхак или рекомендация на будущее" }]
}

Правила:
- Пиши кратко, по-русски, по делу. Без воды.
- category выбирай строго из: projects, identity, instructions, career, general.
- Если для какого-то потока нет материала — верни пустой массив, но reflection заполни всегда.
- Не выдумывай фактов, которых нет в транскриптах.
- Верни ТОЛЬКО JSON.`;

export function dayBounds(day: string): { start: Date; end: Date } {
	const start = new Date(`${day}T00:00:00.000Z`);
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
	return { start, end };
}

export function sanitizeStreams(
	raw: Partial<JournalStreams> | null,
): JournalStreams {
	const learnings = Array.isArray(raw?.learnings)
		? raw.learnings
				.map((l) => ({
					text: String((l as { text?: unknown })?.text ?? "").trim(),
				}))
				.filter((l) => l.text.length > 0)
		: [];
	const tips = Array.isArray(raw?.tips)
		? raw.tips
				.map((t) => ({
					text: String((t as { text?: unknown })?.text ?? "").trim(),
				}))
				.filter((t) => t.text.length > 0)
		: [];
	const memorySuggestions = Array.isArray(raw?.memorySuggestions)
		? raw.memorySuggestions
				.map((m) => {
					const body = String((m as { body?: unknown })?.body ?? "").trim();
					const categoryRaw = String(
						(m as { category?: unknown })?.category ?? "general",
					);
					const category = (memoryCategoryValues as readonly string[]).includes(
						categoryRaw,
					)
						? (categoryRaw as MemoryCategory)
						: "general";
					return { body, category };
				})
				.filter((m) => m.body.length > 0)
		: [];
	return {
		reflection: String(raw?.reflection ?? "").trim(),
		learnings,
		memorySuggestions,
		tips,
	};
}
