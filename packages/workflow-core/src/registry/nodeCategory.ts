/**
 * Coarse grouping for node types, used by the canvas palette to lay nodes out in
 * categorized, searchable sections (dify/sim.ai parity). The string values are
 * part of the public contract (palette ordering, telemetry) — treat as
 * append-only.
 */
export const NodeCategory = {
	/** Entry points and triggers (start, manual input, webhook, schedule). */
	Input: "input",
	/** AI calls (model, agent run, retrieval, embedding, classifier). */
	AI: "ai",
	/** Control flow (condition, switch, loop, merge, approval). */
	Logic: "logic",
	/** Data movement (http, db query, transform, parser). */
	Data: "data",
	/** User-authored code (sandbox execution deferred). */
	Code: "code",
	/** Terminal / side-effecting outputs (response, notify, db write). */
	Output: "output",
	/** External tool invocations (tool call, mcp tool, web search). */
	Tools: "tools",
} as const;

export type NodeCategory = (typeof NodeCategory)[keyof typeof NodeCategory];

/** Stable display order for the palette sections. */
export const NODE_CATEGORY_ORDER: readonly NodeCategory[] = [
	NodeCategory.Input,
	NodeCategory.AI,
	NodeCategory.Logic,
	NodeCategory.Data,
	NodeCategory.Code,
	NodeCategory.Output,
	NodeCategory.Tools,
];

/** Human-facing (RU) label for a category. */
export const NODE_CATEGORY_LABEL: Record<NodeCategory, string> = {
	[NodeCategory.Input]: "Вход",
	[NodeCategory.AI]: "ИИ",
	[NodeCategory.Logic]: "Логика",
	[NodeCategory.Data]: "Данные",
	[NodeCategory.Code]: "Код",
	[NodeCategory.Output]: "Выход",
	[NodeCategory.Tools]: "Инструменты",
};
