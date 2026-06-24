import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Start — the single workflow entry point. No config. Cannot be added or removed
 * from the palette (graph integrity is enforced by `validateGraph`).
 */
export const startNodeType: NodeTypeDefinition = {
	id: "start",
	category: NodeCategory.Input,
	label: "Старт",
	description: "Точка входа",
	render: {
		icon: "Play",
		iconClass: "text-emerald-500",
		miniMapColor: "#10b981",
	},
	inputs: [],
	outputs: [{ name: "out" }],
	configSchema: z.object({}).passthrough(),
	fields: [],
	inspectorHelp:
		"Стартовый узел — точка входа пайплайна. Он единственный и не может быть удалён. Переименуйте его в заголовке выше.",
	singleton: true,
};
