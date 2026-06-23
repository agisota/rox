import type { MemoryCategory } from "@rox/db/schema";

/**
 * Seed examples shown inside an empty memory category, so the screen is never
 * blank. These are NOT written to the DB on load — each example row has a
 * "Добавить себе" action that materializes it via `collections.memoryItems.insert`
 * (the same manual-add path), so a user's deletions stick and nothing is
 * resurrected. Examples disappear the moment a category has at least one real
 * item.
 *
 * Bodies only (the category is the map key); shape matches a manual memory item.
 */
export const DEFAULT_MEMORIES: Record<MemoryCategory, string[]> = {
	projects: [
		"Основной проект — Rox monorepo (Bun + Turbo), десктоп на Electron.",
		"Цель — рабочее десктопное приложение из единого core, ветки довожу до зелёного PR и мержа в main.",
	],
	identity: [
		"Я solo-founder, веду проект один.",
		"Часовой пояс — мой локальный; планируй встречи и дедлайны по нему.",
	],
	instructions: [
		"Отвечай по-русски, в стиле BLUF — главное сразу, без воды.",
		"Всегда приноси пруф (тест/скрин/прогон) перед тем как сказать «готово».",
		"Мультиплатформенно по умолчанию: web + mobile + desktop из общего core.",
	],
	career: [
		"Строю агентные продукты на TypeScript.",
		"Сильные стороны — продуктовое мышление и быстрые итерации от идеи до релиза.",
	],
	general: [
		"Предлагай обходной путь вместо тупика: при блоке перебери ≥2 альтернативы.",
		"Предпочитай удаление лишнего усложнению, если поведение сохраняется.",
	],
};
