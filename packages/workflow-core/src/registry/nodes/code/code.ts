import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Code — runs author-supplied `source` in a chosen `language`, reading named
 * `inputs` and producing named `outputs`. **Config only in this slice**: the
 * sandbox execution is a later slice (per the spec — never a silent wrong
 * result). The fields here capture the contract a sandbox executor will honour.
 * `out` carries the return value, `error` a runtime failure.
 */
export const codeNodeType: NodeTypeDefinition = {
	id: "code",
	category: NodeCategory.Code,
	label: "Код",
	description: "Пользовательский код (выполнение позже)",
	render: {
		icon: "Code",
		iconClass: "text-amber-500",
		miniMapColor: "#f59e0b",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			language: z.enum(["javascript", "typescript", "python"]).optional(),
			source: z.string().min(1).max(50000).optional(),
			inputs: z.record(z.string(), z.string()).optional(),
			outputs: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "language",
			kind: "select",
			label: "Язык",
			placeholder: "Выберите язык",
			required: true,
			options: [
				{ value: "javascript", label: "JavaScript" },
				{ value: "typescript", label: "TypeScript" },
				{ value: "python", label: "Python" },
			],
		},
		{
			key: "source",
			kind: "textarea",
			label: "Исходный код",
			placeholder: "// доступны входы; верните результат",
			description: "Песочница выполнения появится в следующем срезе.",
			required: true,
			maxLength: 50000,
		},
		{
			key: "inputs",
			kind: "key-value",
			label: "Входы (имя → выражение)",
			description: "Что передать в код из контекста выполнения.",
			section: "Входы и выходы",
		},
		{
			key: "outputs",
			kind: "key-value",
			label: "Выходы (имя → тип)",
			description: "Какие значения возвращает код.",
			section: "Входы и выходы",
		},
	],
};
