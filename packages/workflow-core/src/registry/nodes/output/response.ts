import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Response — the terminal node that ends the run. Config mirrors the existing
 * `FinalNodeForm`: an optional free-form `outputNote` (≤2000) for the author's
 * own documentation (does not shape runtime output in v1). Persisted key
 * unchanged.
 */
export const responseNodeType: NodeTypeDefinition = {
	id: "response",
	category: NodeCategory.Output,
	label: "Финал",
	description: "Результат пайплайна",
	render: {
		icon: "Flag",
		iconClass: "text-rose-500",
		miniMapColor: "#f43f5e",
	},
	inputs: [{ name: "in" }],
	outputs: [],
	inspectorHelp: "Финальный узел завершает выполнение пайплайна.",
	configSchema: z
		.object({
			outputNote: z.string().max(2000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "outputNote",
			kind: "textarea",
			label: "Заметка о результате",
			placeholder: "Необязательная заметка о том, что возвращает пайплайн.",
			maxLength: 2000,
		},
	],
};
