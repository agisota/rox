import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Embedding — turns `input` text into a vector using an embedding `model`.
 * Design-time only in this slice — the input and model are captured for a later
 * embedding executor. `out` carries the vector, `error` a call failure.
 */
export const embeddingNodeType: NodeTypeDefinition = {
	id: "embedding",
	category: NodeCategory.AI,
	label: "Эмбеддинг",
	description: "Векторизация текста",
	render: {
		icon: "Binary",
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out", type: "array" }, { name: "error" }],
	configSchema: z
		.object({
			model: z.string().min(1).max(200).optional(),
			input: z.string().min(1).max(8000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "model",
			kind: "select",
			label: "Модель эмбеддинга",
			placeholder: "Выберите модель",
			optionsSource: "embeddingModels",
			required: true,
			description: "Какая модель строит вектор.",
		},
		{
			key: "input",
			kind: "textarea",
			label: "Входной текст",
			placeholder: "Текст для векторизации (можно ссылаться на контекст).",
			required: true,
			maxLength: 8000,
		},
	],
};
