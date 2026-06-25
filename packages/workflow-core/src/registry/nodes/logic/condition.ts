import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Condition (if/else) — evaluates a boolean `expression` against the run context
 * and routes to one of two typed out-ports: `true` / `false`. Design-time only
 * in this slice (no executor); the expression is stored verbatim in
 * `subBlocks.expression` for a later branch-executor to evaluate.
 *
 * The two named out-ports are the new shape the canvas colours/labels as
 * condition branches.
 */
export const conditionNodeType: NodeTypeDefinition = {
	id: "condition",
	category: NodeCategory.Logic,
	label: "Условие",
	description: "Ветвление if/else",
	render: {
		icon: "GitFork",
		iconClass: "text-violet-500",
		miniMapColor: "#8b5cf6",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [
		{ name: "true", label: "Истина", type: "boolean" },
		{ name: "false", label: "Ложь", type: "boolean" },
	],
	configSchema: z
		.object({
			expression: z.string().min(1).max(2000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "expression",
			kind: "textarea",
			label: "Выражение",
			placeholder: "напр. output.score > 0.8",
			description:
				"Булево выражение. Истина → ветка «true», ложь → ветка «false».",
			required: true,
			maxLength: 2000,
		},
	],
};
