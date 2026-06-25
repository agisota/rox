import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Structured Extract — pulls structured data out of the `input` according to a
 * JSON `schema`, using a `model`. The `schema` is stored verbatim (a JSON-Schema
 * string) and validated as JSON by a later executor. Design-time only in this
 * slice — `out` carries the extracted object, `error` a parse/call failure.
 */
export const structuredExtractNodeType: NodeTypeDefinition = {
	id: "structured_extract",
	category: NodeCategory.AI,
	label: "Извлечение по схеме",
	description: "Структурированное извлечение (JSON-схема)",
	render: {
		icon: "Braces",
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out", type: "object" }, { name: "error" }],
	configSchema: z
		.object({
			model: z.string().min(1).max(200).optional(),
			input: z.string().min(1).max(8000).optional(),
			schema: z.string().min(1).max(8000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "model",
			kind: "select",
			label: "Модель",
			placeholder: "Выберите модель",
			optionsSource: "models",
			required: true,
			description: "LLM, выполняющая извлечение.",
		},
		{
			key: "input",
			kind: "textarea",
			label: "Входной текст",
			placeholder: "Из чего извлекать (можно ссылаться на контекст).",
			required: true,
			maxLength: 8000,
		},
		{
			key: "schema",
			kind: "textarea",
			label: "JSON-схема результата",
			placeholder: '{ "type": "object", "properties": { ... } }',
			description: "Описывает форму извлекаемого объекта (JSON Schema).",
			required: true,
			maxLength: 8000,
		},
	],
};
