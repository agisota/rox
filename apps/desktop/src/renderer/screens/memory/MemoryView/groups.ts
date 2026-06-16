import type { MemoryCategory } from "@rox/db/schema";

/** The five fixed memory groups, in display order, with RU labels + hints. */
export const MEMORY_GROUPS: ReadonlyArray<{
	category: MemoryCategory;
	label: string;
	hint: string;
}> = [
	{
		category: "projects",
		label: "Проекты",
		hint: "Над чем работаешь, статусы, ключевые решения",
	},
	{
		category: "identity",
		label: "Личное",
		hint: "Кто ты, контекст, интересы",
	},
	{
		category: "instructions",
		label: "Предпочтения и правила",
		hint: "Как с тобой работать, стиль, «всегда / никогда»",
	},
	{
		category: "career",
		label: "Карьера и история",
		hint: "Роли, навыки, выводы из переписок",
	},
	{
		category: "general",
		label: "Общие правила и принципы",
		hint: "Принципы, которые применяешь везде",
	},
];
