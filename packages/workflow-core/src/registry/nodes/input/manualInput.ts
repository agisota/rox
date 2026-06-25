import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Manual Input — a trigger that collects typed values from the user when the run
 * starts. The author declares `fields` as a map of field name → type
 * (string/number/boolean/json). No inputs (it is an entry point); one `out`
 * port carrying the collected payload.
 */
export const manualInputNodeType: NodeTypeDefinition = {
	id: "manual_input",
	category: NodeCategory.Input,
	label: "Ручной ввод",
	description: "Типизированные поля ввода",
	render: {
		icon: "FormInput",
		iconClass: "text-emerald-500",
		miniMapColor: "#10b981",
	},
	inputs: [],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			fields: z
				.record(z.string(), z.enum(["string", "number", "boolean", "json"]))
				.optional(),
			description: z.string().max(2000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "fields",
			kind: "key-value",
			label: "Поля (имя → тип)",
			description: "Типы: string, number, boolean, json.",
		},
		{
			key: "description",
			kind: "textarea",
			label: "Описание формы",
			placeholder: "Что пользователь должен ввести? (необязательно)",
			maxLength: 2000,
		},
	],
};
