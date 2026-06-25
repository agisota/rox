import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Switch — branches by the value of an input expression. The author supplies a
 * `value` expression and a `cases` map (label → match value); at runtime the
 * matching case routes to its out-port, falling back to `default`.
 *
 * Out-ports in this design-time slice are a fixed set of named branches
 * (`case1..case3`) plus `default`; the canvas binds case labels to these
 * handles. (Fully dynamic per-case ports are a later canvas slice; the config
 * already captures arbitrary cases.)
 */
export const switchNodeType: NodeTypeDefinition = {
	id: "switch",
	category: NodeCategory.Logic,
	label: "Переключатель",
	description: "Ветвление по значению",
	render: {
		icon: "Split",
		iconClass: "text-violet-500",
		miniMapColor: "#8b5cf6",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [
		{ name: "case1", label: "Случай 1" },
		{ name: "case2", label: "Случай 2" },
		{ name: "case3", label: "Случай 3" },
		{ name: "default", label: "По умолчанию" },
	],
	configSchema: z
		.object({
			value: z.string().min(1).max(2000).optional(),
			cases: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "value",
			kind: "textarea",
			label: "Значение для сравнения",
			placeholder: "напр. output.category",
			description: "Выражение, значение которого сравнивается со случаями.",
			required: true,
			maxLength: 2000,
		},
		{
			key: "cases",
			kind: "key-value",
			label: "Случаи (ветка → значение)",
			description:
				"Совпадение направляет в одноимённую ветку; иначе — «default».",
		},
	],
};
