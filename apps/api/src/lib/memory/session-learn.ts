/**
 * Per-session skill-learning — pure prompt + transforms (journal-memory epic, phase 2).
 *
 * Where the daily journal digest summarizes a whole day at once, this path runs
 * shortly after EACH chat session goes idle and distils that single session's
 * transcript into durable `memory_items` (one small, focused memory each).
 *
 * Deliberately free of any `@rox/db/client` import so it can be unit-tested
 * without a database connection. The db-dependent orchestration (find unlearned
 * sessions → extract → upsert → stamp `learned_at`) lives in
 * `session-learn-generation.ts`.
 *
 * ── Prompt provenance ──────────────────────────────────────────────────────
 * The extraction prompt is grounded in Anthropic's official memory guidance.
 * Anthropic does not publish a single verbatim "session-extraction prompt"; its
 * two published memory artifacts are (1) the agentic *memory tool* file-directory
 * protocol and (2) the *Managed Agents — memory* guidance. We adopt the latter's
 * canonical taxonomy of what is worth retaining — "user preferences, project
 * conventions, prior mistakes, and domain context" — and its directive to store
 * "many small, focused" memories rather than a few large ones, then map those
 * onto Rox's five fixed categories. See:
 *   - https://platform.claude.com/docs/en/managed-agents/memory
 *   - https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
 * If/when Anthropic publishes a verbatim extraction prompt, drop it in here and
 * keep the JSON-shape + 5-category mapping below.
 */

import { type MemoryCategory, memoryCategoryValues } from "@rox/db/schema";

/** Max chat sessions distilled per reconcile tick (LLM cost + latency guard). */
export const MAX_SESSIONS_PER_TICK = 25;

/**
 * Per-session transcript character ceiling. Mirrors the journal digest's
 * per-session budget (`MAX_TRANSCRIPT_CHARS_PER_SESSION = 12_000`) so a single
 * session can't blow the cheap model's context or run up cost.
 */
export const MAX_TRANSCRIPT_CHARS = 12_000;

/** Hard cap on memories accepted from one session, so a runaway reply can't flood the store. */
export const MAX_MEMORIES_PER_SESSION = 12;

export interface SessionMemory {
	body: string;
	category: MemoryCategory;
}

export const SESSION_LEARN_SYSTEM_PROMPT = `Ты — система долговременной памяти ассистента Rox. На вход ты получаешь транскрипт ОДНОЙ завершённой рабочей сессии пользователя. Твоя задача — извлечь из неё только то, что стоит помнить и в будущих сессиях.

Опирайся на официальное руководство Anthropic по памяти: храни устойчивые предпочтения пользователя, договорённости и конвенции его проектов, его прежние ошибки и выводы, а также доменный контекст. Делай память из МНОГИХ маленьких, точечных записей — по одному факту на запись, а не один большой абзац.

Верни СТРОГО JSON-объект без markdown и без текста вне JSON, по схеме:
{ "memories": [{ "body": "одна краткая устойчивая запись памяти на русском языке", "category": "projects|identity|instructions|career|general" }] }

Категории:
- projects — над какими проектами/репозиториями/задачами идёт работа, их устройство и договорённости.
- identity — кто пользователь: роль, контекст, стиль работы, инструменты.
- instructions — устойчивые правила и предпочтения «как со мной работать» (язык, формат, что делать/не делать).
- career — карьерные цели, навыки, развитие.
- general — устойчивое, что не попало в остальные категории.

Правила:
- Запоминай только ДОЛГОВРЕМЕННОЕ. НЕ запоминай разовые вопросы, детали одной задачи, отладочный шум или то, что устареет после этой сессии.
- Пиши по-русски, кратко, по одному факту на запись.
- category выбирай строго из: projects, identity, instructions, career, general.
- Не выдумывай фактов, которых нет в транскрипте.
- Если запоминать нечего — верни { "memories": [] }.
- Верни ТОЛЬКО JSON-объект.`;

/**
 * Coerce a raw model reply (already JSON-parsed) into clean {@link SessionMemory}
 * rows: trims bodies, drops empties, coerces unknown categories to `general`, and
 * caps the count. Mirrors the journal/archive sanitizers so behaviour is uniform.
 */
export function sanitizeSessionMemories(memories: unknown): SessionMemory[] {
	if (!Array.isArray(memories)) return [];
	const out: SessionMemory[] = [];
	for (const m of memories) {
		if (typeof m !== "object" || m === null) continue;
		const body = String((m as { body?: unknown }).body ?? "").trim();
		if (!body) continue;
		const categoryRaw = String(
			(m as { category?: unknown }).category ?? "general",
		);
		const category = (memoryCategoryValues as readonly string[]).includes(
			categoryRaw,
		)
			? (categoryRaw as MemoryCategory)
			: "general";
		out.push({ body, category });
		if (out.length >= MAX_MEMORIES_PER_SESSION) break;
	}
	return out;
}
