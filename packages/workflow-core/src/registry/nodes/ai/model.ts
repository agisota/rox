import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Model (LLM call) — a single chat-completion request. The author picks a
 * `model`, writes a `systemPrompt` / `userPrompt`, and tunes `temperature` and
 * `maxTokens`. Distinct from `agent_run` (a full agent-role loop): this is a
 * one-shot prompt → completion. Design-time only in this slice — the prompts and
 * params are captured for a later LLM-call executor. `out` carries the
 * completion, `error` a call failure.
 */
export const modelNodeType: NodeTypeDefinition = {
	id: "model",
	category: NodeCategory.AI,
	label: "Модель (LLM)",
	description: "Одиночный вызов LLM",
	render: {
		icon: "Sparkles",
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	inputs: [{ name: "in" }],
	outputs: [{ name: "out", type: "message" }, { name: "error" }],
	configSchema: z
		.object({
			model: z.string().min(1).max(200).optional(),
			systemPrompt: z.string().max(8000).optional(),
			userPrompt: z.string().min(1).max(8000).optional(),
			temperature: z.number().min(0).max(2).optional(),
			maxTokens: z.number().int().min(1).max(200000).optional(),
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
			description: "Какая LLM выполняет запрос.",
		},
		{
			key: "systemPrompt",
			kind: "textarea",
			label: "Системный промпт",
			placeholder: "Инструкция/роль для модели (необязательно).",
			maxLength: 8000,
			section: "Промпт",
		},
		{
			key: "userPrompt",
			kind: "textarea",
			label: "Пользовательский промпт",
			placeholder: "Запрос к модели (можно ссылаться на контекст).",
			required: true,
			maxLength: 8000,
			section: "Промпт",
		},
		{
			key: "temperature",
			kind: "number",
			label: "Температура",
			placeholder: "0–2",
			min: 0,
			max: 2,
			step: 0.1,
			section: "Параметры генерации",
		},
		{
			key: "maxTokens",
			kind: "number",
			label: "Макс. токенов",
			placeholder: "1–200000",
			min: 1,
			max: 200000,
			step: 1,
			section: "Параметры генерации",
		},
	],
};
