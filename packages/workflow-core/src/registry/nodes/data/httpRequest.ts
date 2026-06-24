import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * HTTP Request — calls an external endpoint. The author sets the `method`, a
 * `url`, optional `headers` (key → value) and a `body` (raw string/template).
 * Design-time only in this slice — the request is captured for a later HTTP
 * executor. `out` carries the response, `error` a request failure.
 */
export const httpRequestNodeType: NodeTypeDefinition = {
	id: "http_request",
	category: NodeCategory.Data,
	label: "HTTP-запрос",
	description: "Вызов внешнего эндпоинта",
	render: {
		icon: "Globe",
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			method: z
				.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
				.optional(),
			url: z.string().min(1).max(2048).optional(),
			headers: z.record(z.string(), z.string()).optional(),
			body: z.string().max(20000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "method",
			kind: "select",
			label: "Метод",
			placeholder: "Выберите метод",
			required: true,
			options: [
				{ value: "GET", label: "GET" },
				{ value: "POST", label: "POST" },
				{ value: "PUT", label: "PUT" },
				{ value: "PATCH", label: "PATCH" },
				{ value: "DELETE", label: "DELETE" },
				{ value: "HEAD", label: "HEAD" },
			],
		},
		{
			key: "url",
			kind: "text",
			label: "URL",
			placeholder: "https://api.example.com/v1/resource",
			description: "Можно ссылаться на контекст выполнения.",
			required: true,
			maxLength: 2048,
		},
		{
			key: "headers",
			kind: "key-value",
			label: "Заголовки (ключ → значение)",
			description: "HTTP-заголовки запроса.",
		},
		{
			key: "body",
			kind: "textarea",
			label: "Тело запроса",
			placeholder: "Сырое тело/шаблон (для POST/PUT/PATCH).",
			maxLength: 20000,
		},
	],
};
