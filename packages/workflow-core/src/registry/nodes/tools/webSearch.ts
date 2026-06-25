import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Web Search — runs a `query` against a web search provider and returns the top
 * `maxResults` results. Design-time only in this slice — the query is captured
 * for a later search executor. `out` carries the results, `error` a search
 * failure.
 */
export const webSearchNodeType: NodeTypeDefinition = {
	id: "web_search",
	category: NodeCategory.Tools,
	label: "Веб-поиск",
	description: "Поиск в интернете",
	render: {
		icon: "Search",
		iconClass: "text-teal-500",
		miniMapColor: "#14b8a6",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out", type: "array" }, { name: "error" }],
	configSchema: z
		.object({
			query: z.string().min(1).max(2000).optional(),
			maxResults: z.number().int().min(1).max(50).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "query",
			kind: "textarea",
			label: "Запрос",
			placeholder: "Что искать (можно ссылаться на контекст).",
			required: true,
			maxLength: 2000,
		},
		{
			key: "maxResults",
			kind: "number",
			label: "Макс. результатов",
			placeholder: "1–50",
			min: 1,
			max: 50,
			step: 1,
		},
	],
};
