import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Variable Set — writes a `value` into a named run variable `key`, making it
 * available to downstream nodes. Design-time only in this slice — the assignment
 * is captured for a later executor that mutates the run's variable scope. `out`
 * continues the flow.
 */
export const variableSetNodeType: NodeTypeDefinition = {
	id: "variable_set",
	category: NodeCategory.Data,
	label: "Установить переменную",
	description: "Запись значения в переменную потока",
	render: {
		icon: "Variable",
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			key: z
				.string()
				.min(1)
				.max(128)
				.regex(
					/^[A-Za-z_][A-Za-z0-9_]*$/,
					"Имя: буквы/цифры/подчёркивание, не с цифры",
				)
				.optional(),
			value: z.string().max(20000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "key",
			kind: "text",
			label: "Имя переменной",
			placeholder: "напр. customer_id",
			description: "Буквы, цифры и подчёркивание; не начинается с цифры.",
			required: true,
			maxLength: 128,
		},
		{
			key: "value",
			kind: "textarea",
			label: "Значение",
			placeholder: "Литерал или выражение (можно ссылаться на контекст).",
			required: true,
			maxLength: 20000,
		},
	],
};
