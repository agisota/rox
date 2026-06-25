import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Knowledge Retrieval (RAG) — fetches the most relevant chunks from a bound
 * `knowledgeBase` for a `query`, returning the top `topK` matches. The
 * `knowledgeBase` uses the dynamic `knowledgeBases` option source (bound by the
 * editor; until then it renders with a "not found" hint, never blocking).
 * Design-time only in this slice — `out` carries the retrieved context for a
 * later retrieval executor, `error` a lookup failure.
 */
export const knowledgeRetrievalNodeType: NodeTypeDefinition = {
	id: "knowledge_retrieval",
	category: NodeCategory.AI,
	label: "Поиск по базе знаний",
	description: "RAG-выборка релевантных фрагментов",
	render: {
		icon: "BookOpen",
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			knowledgeBase: z.string().min(1).max(200).optional(),
			query: z.string().min(1).max(4000).optional(),
			topK: z.number().int().min(1).max(100).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "knowledgeBase",
			kind: "select",
			label: "База знаний",
			placeholder: "Выберите базу знаний",
			optionsSource: "knowledgeBases",
			required: true,
			description: "Источник для поиска контекста.",
		},
		{
			key: "query",
			kind: "textarea",
			label: "Запрос",
			placeholder: "Текст запроса (можно ссылаться на контекст).",
			required: true,
			maxLength: 4000,
		},
		{
			key: "topK",
			kind: "number",
			label: "Кол-во фрагментов (top-K)",
			placeholder: "1–100",
			min: 1,
			max: 100,
			step: 1,
		},
	],
};
