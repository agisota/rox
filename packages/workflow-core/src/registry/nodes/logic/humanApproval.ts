import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Human Approval — pauses the run until a human approves or rejects. Config
 * mirrors the existing `ConfirmationNodeForm`: an optional `approvalMessage`
 * (≤2000) shown to the approver. Persisted key unchanged.
 */
export const humanApprovalNodeType: NodeTypeDefinition = {
	id: "human_approval",
	category: NodeCategory.Logic,
	label: "Подтверждение",
	description: "Гейт подтверждения",
	render: {
		icon: "ShieldCheck",
		iconClass: "text-amber-500",
		miniMapColor: "#f59e0b",
	},
	inputs: [{ name: "in" }],
	outputs: [{ name: "approved" }, { name: "rejected" }],
	pausesRun: true,
	configSchema: z
		.object({
			approvalMessage: z.string().max(2000).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "approvalMessage",
			kind: "textarea",
			label: "Сообщение для подтверждения",
			placeholder:
				"Что должен проверить человек перед продолжением? (необязательно)",
			maxLength: 2000,
		},
	],
};
