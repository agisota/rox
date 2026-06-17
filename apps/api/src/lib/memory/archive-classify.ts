/**
 * Archive-import classification — journal-memory epic.
 *
 * Given one conversation transcript, asks Rox R1 to extract durable memories
 * (facts / rules / preferences) and assign each to one of the five Rox groups.
 * Returns [] when R1 is unconfigured or nothing is worth remembering.
 */

import { type MemoryCategory, memoryCategoryValues } from "@rox/db/schema";
import { callR1Json, isR1Configured } from "../r1";

const MAX_CONVERSATION_CHARS = 16_000;

const SYSTEM_PROMPT = `Ты извлекаешь долговременную память пользователя из транскрипта диалога с ассистентом. Верни СТРОГО JSON-объект по схеме:
{ "memories": [{ "body": "краткий устойчивый факт, правило или предпочтение о пользователе или его проектах", "category": "projects|identity|instructions|career|general" }] }

Правила:
- Запоминай только устойчивое (кто пользователь, над чем работает, его правила и предпочтения) — не разовые вопросы и не детали одной задачи.
- Пиши по-русски, кратко.
- category строго из: projects, identity, instructions, career, general.
- Если запоминать нечего — верни { "memories": [] }.
- Только JSON-объект, без markdown.`;

export interface ClassifiedMemory {
	body: string;
	category: MemoryCategory;
}

export async function classifyConversation(
	text: string,
): Promise<ClassifiedMemory[]> {
	if (!isR1Configured() || text.trim().length === 0) return [];

	const raw = await callR1Json<{ memories?: unknown }>(
		[
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: text.slice(0, MAX_CONVERSATION_CHARS) },
		],
		{ temperature: 0.2, maxTokens: 1_024 },
	);
	return sanitize(raw?.memories);
}

function sanitize(memories: unknown): ClassifiedMemory[] {
	if (!Array.isArray(memories)) return [];
	const out: ClassifiedMemory[] = [];
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
	}
	return out;
}
