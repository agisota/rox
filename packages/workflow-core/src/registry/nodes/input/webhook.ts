import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Webhook — an inbound HTTP trigger. The author sets a `path` (the route the
 * pipeline listens on) and an optional shared `secret` used to authenticate
 * callers. Entry point: no inputs, one `out` port carrying the request payload.
 * Wiring the path to a live endpoint is a later (execution) slice.
 */
export const webhookNodeType: NodeTypeDefinition = {
	id: "webhook",
	category: NodeCategory.Input,
	label: "Вебхук",
	description: "Входящий HTTP-триггер",
	render: {
		icon: "Webhook",
		iconClass: "text-emerald-500",
		miniMapColor: "#10b981",
	},
	inputs: [],
	outputs: [{ name: "out" }],
	configSchema: z
		.object({
			path: z
				.string()
				.min(1)
				.max(512)
				.regex(/^\//, "Путь должен начинаться с «/»")
				.optional(),
			secret: z.string().max(512).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "path",
			kind: "text",
			label: "Путь",
			placeholder: "/hooks/my-pipeline",
			description: "Маршрут, на который приходят запросы (начинается с «/»).",
			required: true,
			maxLength: 512,
		},
		{
			key: "secret",
			kind: "text",
			label: "Секрет",
			placeholder: "Подпись/токен для проверки отправителя (необязательно)",
			maxLength: 512,
		},
	],
};
