import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Merge — joins multiple incoming branches back into a single path. `mode`
 * decides the join semantics for a later executor: `wait_all` (barrier — wait
 * for every wired branch) or `first` (pass through the first arrival). One
 * `out` port. Inputs are not marked required (a merge with a single branch is
 * still valid).
 */
export const mergeNodeType: NodeTypeDefinition = {
	id: "merge",
	category: NodeCategory.Logic,
	label: "Слияние",
	description: "Объединение веток",
	render: {
		icon: "GitMerge",
		iconClass: "text-violet-500",
		miniMapColor: "#8b5cf6",
	},
	inputs: [{ name: "in" }],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			mode: z.enum(["wait_all", "first"]).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "mode",
			kind: "select",
			label: "Режим слияния",
			placeholder: "Выберите режим",
			description:
				"«Ждать все» — барьер по всем веткам; «Первая» — пропустить первое поступление.",
			options: [
				{ value: "wait_all", label: "Ждать все ветки" },
				{ value: "first", label: "Первая поступившая" },
			],
		},
	],
};
