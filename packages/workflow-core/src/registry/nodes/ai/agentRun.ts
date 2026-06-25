import { z } from "zod";
import { NodeCategory } from "../../nodeCategory";
import type { NodeTypeDefinition } from "../../nodeTypeDefinition";

/**
 * Agent Run — runs an agent role (chat in-process or CLI in a worktree) as a
 * pipeline node. Config mirrors the web/desktop `AgentNodeForm` exactly: a bound
 * role slug plus optional per-node overrides. Persisted keys are unchanged
 * (`roleSlug` / `modelOverride` / `maxTurns` / `temperature`) so existing graphs
 * and the existing executor keep working.
 */
export const agentRunNodeType: NodeTypeDefinition = {
	id: "agent_run",
	category: NodeCategory.AI,
	label: "Агент-роль",
	description: "Агент-роль",
	render: {
		icon: "Bot",
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	inputs: [{ name: "in" }],
	outputs: [{ name: "out", type: "message" }, { name: "error" }],
	configSchema: z
		.object({
			roleSlug: z.string().min(1).optional(),
			modelOverride: z.string().max(200).optional(),
			maxTurns: z.number().int().min(1).max(200).optional(),
			temperature: z.number().min(0).max(2).optional(),
		})
		.passthrough(),
	fields: [
		{
			key: "roleSlug",
			kind: "select",
			label: "Роль агента",
			placeholder: "Выберите роль",
			optionsSource: "roles",
			required: true,
			description: "Узел не выполнится без привязанной роли.",
		},
		{
			key: "modelOverride",
			kind: "text",
			label: "Модель (переопределение)",
			placeholder: "напр. gpt-5 (необязательно)",
			maxLength: 200,
		},
		{
			key: "maxTurns",
			kind: "number",
			label: "Макс. шагов",
			placeholder: "1–200",
			min: 1,
			max: 200,
			step: 1,
		},
		{
			key: "temperature",
			kind: "number",
			label: "Температура",
			placeholder: "0–2",
			min: 0,
			max: 2,
			step: 0.1,
		},
	],
};
