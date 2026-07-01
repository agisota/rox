/**
 * Pipeline + role starter templates for the "pick from template" flows.
 *
 * Pure, client-safe data: a pipeline template is a ready-made `RoxWorkflowState`
 * graph (start → roles → optional approval), and a role template is an
 * {@link AgentRolePreset} bundle. The four role templates mirror the built-in
 * roles seeded server-side (`agentRole.seedBuiltins`) so the canvas shows
 * sensible nodes even before the org has created custom roles.
 */

import type { AgentRolePreset, RoxWorkflowState } from "@rox/workflow-core";

export type PipelineTemplate = {
	id: string;
	name: string;
	/** Short RU description shown in the template picker. */
	description: string;
	/** Suggested kebab-case slug seed. */
	slugSeed: string;
	build: () => RoxWorkflowState;
};

export type RoleTemplate = {
	slug: string;
	name: string;
	description: string;
	preset: AgentRolePreset;
};

const DEFAULT_CHAT_AGENT = "rox";

// ---------------------------------------------------------------------------
// Role templates (mirror the built-in roles)
// ---------------------------------------------------------------------------

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
	{
		slug: "prompt-improver",
		name: "Промпт-инженер",
		description: "Уточняет и обогащает исходный запрос перед декомпозицией.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — промпт-инженер. Переформулируй запрос пользователя в чёткое ТЗ: цель, границы, критерий готовности. Не выполняй задачу — только улучшай постановку.",
			skillSlugs: [],
			settings: { maxTurns: 4 },
		},
	},
	{
		slug: "decomposer",
		name: "Декомпозитор",
		description: "Разбивает задачу на независимые подзадачи с критериями.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — декомпозитор. Разбей ТЗ на 3–7 независимых подзадач. Для каждой: цель, артефакт, критерий готовности. Верни нумерованный список.",
			skillSlugs: [],
			settings: { maxTurns: 4 },
		},
	},
	{
		slug: "orchestrator",
		name: "Оркестратор",
		description: "Координирует выполнение подзадач и сводит результаты.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — оркестратор. На основе декомпозиции спланируй порядок выполнения, отметь зависимости и собери результаты подзадач в единый итог.",
			skillSlugs: [],
			settings: { maxTurns: 8 },
		},
	},
	{
		slug: "critic",
		name: "Критик",
		description: "Адверсариально проверяет результат и ищет пробелы.",
		preset: {
			agentKind: "chat",
			agentId: DEFAULT_CHAT_AGENT,
			systemPrompt:
				"Ты — критик. Проверь результат адверсариально: найди ошибки, пропущенные требования и риски. Дай конкретный список замечаний и вердикт.",
			skillSlugs: [],
			settings: { maxTurns: 4 },
		},
	},
] as const;

// ---------------------------------------------------------------------------
// Pipeline templates
// ---------------------------------------------------------------------------

function agentBlock(
	name: string,
	roleSlug: string,
	position: { x: number; y: number },
) {
	return {
		type: "agent_run",
		name,
		position,
		subBlocks: { roleSlug },
	};
}

/** A linear refine → decompose → orchestrate → critic chain. */
function buildRefineDecomposeChain(): RoxWorkflowState {
	return {
		blocks: {
			start: { type: "start", name: "Старт", position: { x: 80, y: 220 } },
			improve: agentBlock("Промпт-инженер", "prompt-improver", {
				x: 340,
				y: 220,
			}),
			decompose: agentBlock("Декомпозитор", "decomposer", { x: 600, y: 220 }),
			orchestrate: agentBlock("Оркестратор", "orchestrator", {
				x: 860,
				y: 220,
			}),
			critic: agentBlock("Критик", "critic", { x: 1120, y: 220 }),
		},
		edges: [
			{ id: "e-start-improve", source: "start", target: "improve" },
			{ id: "e-improve-decompose", source: "improve", target: "decompose" },
			{
				id: "e-decompose-orchestrate",
				source: "decompose",
				target: "orchestrate",
			},
			{ id: "e-orchestrate-critic", source: "orchestrate", target: "critic" },
		],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "Уточнение → декомпозиция" },
	};
}

/** Orchestrator → critic with a human approval gate before finishing. */
function buildReviewWithApproval(): RoxWorkflowState {
	return {
		blocks: {
			start: { type: "start", name: "Старт", position: { x: 80, y: 220 } },
			orchestrate: agentBlock("Оркестратор", "orchestrator", {
				x: 340,
				y: 220,
			}),
			critic: agentBlock("Критик", "critic", { x: 600, y: 220 }),
			approval: {
				type: "human_approval",
				name: "Подтверждение",
				position: { x: 860, y: 220 },
			},
			done: { type: "response", name: "Готово", position: { x: 1120, y: 220 } },
		},
		edges: [
			{ id: "e-start-orchestrate", source: "start", target: "orchestrate" },
			{ id: "e-orchestrate-critic", source: "orchestrate", target: "critic" },
			{ id: "e-critic-approval", source: "critic", target: "approval" },
			{ id: "e-approval-done", source: "approval", target: "done" },
		],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "Ревью с подтверждением" },
	};
}

/** A single start node — the empty canvas template. */
function buildBlank(): RoxWorkflowState {
	return {
		blocks: {
			start: { type: "start", name: "Старт", position: { x: 120, y: 200 } },
		},
		edges: [],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "Пустой пайплайн" },
	};
}

export const PIPELINE_TEMPLATES: readonly PipelineTemplate[] = [
	{
		id: "blank",
		name: "Пустой",
		description: "Чистый холст с одним узлом старта.",
		slugSeed: "pipeline",
		build: buildBlank,
	},
	{
		id: "refine-decompose",
		name: "Уточнение → декомпозиция",
		description:
			"Промпт-инженер → декомпозитор → оркестратор → критик. Линейная цепочка.",
		slugSeed: "refine-decompose",
		build: buildRefineDecomposeChain,
	},
	{
		id: "review-approval",
		name: "Ревью с подтверждением",
		description:
			"Оркестратор → критик → ручное подтверждение → ответ. Гейт перед финалом.",
		slugSeed: "review-approval",
		build: buildReviewWithApproval,
	},
] as const;
