import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Notify — sends a message to a delivery `channel` (email / slack / webhook /
 * in-app). The `message` may reference run context (templated by a later
 * executor). Side-effecting but chainable: `out` continues the flow, `error`
 * carries a delivery failure.
 */
export const notifyNodeType: NodeTypeDefinition = {
	id: "notify",
	category: NodeCategory.Output,
	label: "Уведомление",
	description: "Отправка сообщения в канал",
	render: {
		icon: "Bell",
		iconClass: "text-rose-500",
		miniMapColor: "#f43f5e",
	},
	inputs: [{ name: "in", required: true }],
	outputs: [{ name: "out" }, { name: "error" }],
	configSchema: z
		.object({
			channel: z.enum(["email", "slack", "webhook", "in_app"]).optional(),
			message: z.string().min(1).max(4000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "channel",
			kind: "select",
			label: "Канал",
			placeholder: "Выберите канал",
			required: true,
			options: [
				{ value: "email", label: "Email" },
				{ value: "slack", label: "Slack" },
				{ value: "webhook", label: "Вебхук" },
				{ value: "in_app", label: "В приложении" },
			],
		},
		{
			key: "message",
			kind: "textarea",
			label: "Сообщение",
			placeholder: "Текст уведомления (можно ссылаться на контекст).",
			required: true,
			maxLength: 4000,
		},
	],
};
