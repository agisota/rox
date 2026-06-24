import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Parser — parses the incoming `input` string into structured data according to
 * a `format` (JSON / CSV / XML / YAML). Design-time only in this slice — the
 * format and input are captured for a later parse executor. `out` carries the
 * parsed value, `error` a parse failure.
 */
export const parserNodeType: NodeTypeDefinition = {
	id: "parser",
	category: NodeCategory.Data,
	label: "Парсер",
	description: "Разбор строки в структуру",
	render: {
		icon: "FileJson",
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			format: z.enum(["json", "csv", "xml", "yaml"]).optional(),
			input: z.string().max(20000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "format",
			kind: "select",
			label: "Формат",
			placeholder: "Выберите формат",
			required: true,
			options: [
				{ value: "json", label: "JSON" },
				{ value: "csv", label: "CSV" },
				{ value: "xml", label: "XML" },
				{ value: "yaml", label: "YAML" },
			],
		},
		{
			key: "input",
			kind: "textarea",
			label: "Входная строка",
			placeholder: "Что разбирать (можно ссылаться на контекст).",
			description: "Если пусто — берётся значение из входного порта.",
			maxLength: 20000,
		},
	],
};
