import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Tool Call — invokes a named registered `tool` with an `arguments` map (param →
 * value). The `tool` uses the dynamic `tools` option source (bound by the
 * editor; until then it renders with a "not found" hint, never blocking).
 * Design-time only in this slice — `out` carries the tool result, `error` a call
 * failure.
 */
export const toolCallNodeType: NodeTypeDefinition = {
	id: "tool_call",
	category: NodeCategory.Tools,
	label: "Вызов инструмента",
	description: "Запуск зарегистрированного инструмента",
	render: {
		icon: "Wrench",
		iconClass: "text-teal-500",
		miniMapColor: "#14b8a6",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			tool: z.string().min(1).max(200).optional(),
			arguments: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "tool",
			kind: "select",
			label: "Инструмент",
			placeholder: "Выберите инструмент",
			optionsSource: "tools",
			required: true,
			description: "Какой инструмент вызвать.",
		},
		{
			key: "arguments",
			kind: "key-value",
			label: "Аргументы (имя → значение)",
			description: "Значения могут ссылаться на контекст выполнения.",
		},
	],
};
