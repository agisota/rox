import { z } from "zod";
import { MAX_LOOP_ITERATIONS } from "../../../graph/loopWalk";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Loop — iterates a sub-graph. Config mirrors the existing `LoopNodeForm`:
 * optional `maxIterations` (integer 1..{@link MAX_LOOP_ITERATIONS}; blank = no
 * explicit limit, the runtime applies its default). Loop-body membership lives in
 * `RoxWorkflowState.loops[].nodes` (canvas wiring), not here.
 *
 * The upper bound is the runtime's hard loop-replay cap (#527) — the config schema
 * + inspector field now mirror it so a user cannot enter a value the executor will
 * silently clamp away.
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
			maxIterations: z
				.number()
				.int()
				.min(1)
				.max(MAX_LOOP_ITERATIONS)
				.optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "maxIterations",
			kind: "number",
			label: "Максимум итераций",
			placeholder: `напр. 5 (макс. ${MAX_LOOP_ITERATIONS})`,
			description: `Тело цикла настраивается связями на холсте. Максимум ${MAX_LOOP_ITERATIONS} итераций за запуск.`,
			min: 1,
			max: MAX_LOOP_ITERATIONS,
			step: 1,
		},
	],
};
