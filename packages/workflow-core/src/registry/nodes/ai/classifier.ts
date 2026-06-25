import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Classifier — assigns the `input` to one of the author-declared `classes` using
 * a `model`. `classes` is a map of class name → description (the description
 * helps the model pick). Design-time only in this slice — the matched class is
 * carried on `out` for a later classifier executor (which a canvas slice can
 * route per-class); `error` carries a call failure.
 */
export const classifierNodeType: NodeTypeDefinition = {
	id: "classifier",
	category: NodeCategory.AI,
	label: "Классификатор",
	description: "Классификация по заданным классам",
	render: {
		icon: "Tags",
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	inputs: [{ name: "in", required: true, type: "string" }],
	outputs: [{ name: "out", type: "string" }, { name: "error" }],
	configSchema: z
		.object({
			model: z.string().min(1).max(200).optional(),
			input: z.string().min(1).max(8000).optional(),
			classes: z.record(z.string(), z.string()).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "model",
			kind: "select",
			label: "Модель",
			placeholder: "Выберите модель",
			optionsSource: "models",
			required: true,
			description: "LLM, выполняющая классификацию.",
		},
		{
			key: "input",
			kind: "textarea",
			label: "Входной текст",
			placeholder: "Что классифицируем (можно ссылаться на контекст).",
			required: true,
			maxLength: 8000,
		},
		{
			key: "classes",
			kind: "key-value",
			label: "Классы (имя → описание)",
			description: "Описание помогает модели выбрать класс.",
			required: true,
		},
	],
};
