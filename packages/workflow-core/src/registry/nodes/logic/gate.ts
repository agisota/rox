import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Gate / Route — allows or blocks the flow based on a boolean `condition`. When
 * the condition holds the run continues through `allowed`; otherwise it leaves
 * via `blocked` (which a later executor can route to a dead-end or an alternate
 * path). Design-time only; the condition is stored verbatim.
 */
export const gateNodeType: NodeTypeDefinition = {
	id: "gate",
	category: NodeCategory.Logic,
	label: "Шлюз",
	description: "Пропустить/заблокировать",
	render: {
		icon: "ShieldHalf",
		iconClass: "text-violet-500",
		miniMapColor: "#8b5cf6",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [
		{ name: "allowed", label: "Пропущено", type: "boolean" },
		{ name: "blocked", label: "Заблокировано", type: "boolean" },
	],
	configSchema: z
		.object({
			condition: z.string().min(1).max(2000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "condition",
			kind: "textarea",
			label: "Условие пропуска",
			placeholder: "напр. context.user.isAdmin",
			description: "Истина — поток идёт в «allowed»; ложь — в «blocked».",
			required: true,
			maxLength: 2000,
		},
	],
};
