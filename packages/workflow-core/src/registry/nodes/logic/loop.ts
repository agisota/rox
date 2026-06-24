import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Loop — iterates a sub-graph. Config mirrors the existing `LoopNodeForm`:
 * optional `maxIterations` (integer 1..200; blank = no limit). Loop-body
 * membership lives in `RoxWorkflowState.loops[].nodes` (canvas wiring), not here.
 */
export const loopNodeType: NodeTypeDefinition = {
	id: "loop",
	category: NodeCategory.Logic,
	label: "Цикл",
	description: "Повтор тела",
	render: {
		icon: "Repeat",
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	inputs: [{ name: "in" }],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			maxIterations: z.number().int().min(1).max(200).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "maxIterations",
			kind: "number",
			label: "Максимум итераций",
			placeholder: "напр. 5 (пусто — без лимита)",
			description: "Тело цикла настраивается связями на холсте.",
			min: 1,
			max: 200,
			step: 1,
		},
	],
};
