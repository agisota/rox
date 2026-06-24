import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * DB Write — persists data to a `target` (table/collection) using a column →
 * value `mapping`. `target` uses the dynamic `dbTargets` option source (bound by
 * the editor in a later slice; until then it renders as a free selection with a
 * "not found" hint, never blocking). Side-effecting but chainable: `out`
 * continues, `error` carries a write failure.
 */
export const dbWriteNodeType: NodeTypeDefinition = {
	id: "db_write",
	category: NodeCategory.Output,
	label: "Запись в БД",
	description: "Сохранение данных в таблицу",
	render: {
		icon: "DatabaseZap",
		iconClass: "text-rose-500",
		miniMapColor: "#f43f5e",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			target: z.string().min(1).max(200).optional(),
			mapping: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "target",
			kind: "select",
			label: "Цель (таблица)",
			placeholder: "Выберите таблицу",
			optionsSource: "dbTargets",
			required: true,
			description: "Куда записывать строки.",
		},
		{
			key: "mapping",
			kind: "key-value",
			label: "Сопоставление (колонка → значение)",
			description: "Значения могут ссылаться на контекст выполнения.",
		},
	],
};
