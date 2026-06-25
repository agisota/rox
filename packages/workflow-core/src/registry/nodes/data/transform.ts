import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Transform — reshapes the incoming payload. Two modes: a `template` (render a
 * single string/template from the context) or a `mapping` (output field → source
 * expression). The author picks `mode`; the matching field drives a later
 * transform executor. Design-time only in this slice — `out` carries the
 * transformed value.
 */
export const transformNodeType: NodeTypeDefinition = {
	id: "transform",
	category: NodeCategory.Data,
	label: "Преобразование",
	description: "Шаблон или сопоставление полей",
	render: {
		icon: "Shuffle",
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			mode: z.enum(["template", "mapping"]).optional(),
			template: z.string().max(20000).optional(),
			mapping: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "mode",
			kind: "select",
			label: "Режим",
			placeholder: "Выберите режим",
			description:
				"«Шаблон» — собрать строку; «Сопоставление» — собрать объект из полей.",
			options: [
				{ value: "template", label: "Шаблон" },
				{ value: "mapping", label: "Сопоставление" },
			],
		},
		{
			key: "template",
			kind: "textarea",
			label: "Шаблон",
			placeholder: "напр. Привет, {{ context.name }}!",
			description: "Используется в режиме «Шаблон».",
			maxLength: 20000,
		},
		{
			key: "mapping",
			kind: "key-value",
			label: "Сопоставление (поле → выражение)",
			description: "Используется в режиме «Сопоставление».",
		},
	],
};
