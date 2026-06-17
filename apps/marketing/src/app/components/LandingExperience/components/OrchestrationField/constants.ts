/**
 * Tuning + content for the Mercury Command–inspired agent-orchestration hero.
 *
 * The WebGL field renders thousands of glowing "agent" particles that begin as
 * chaos and self-organise into rotating orchestration rings (a Saturn-ring /
 * toroid metaphor). Colors map to agent roles; a command bar lets the visitor
 * "dispatch" a task, which pulses the swarm and logs a short mock agent run.
 */

/** A role an agent particle can take — drives its accent color. */
export interface AgentRole {
	/** Short Russian role label (used in the dispatch log). */
	label: string;
	/** Emoji glyph shown in the dispatch log. */
	glyph: string;
	/** sRGB hex accent color for this role's particles + log chip. */
	color: string;
}

/**
 * Agent roles + their accent colors. Orange leads (the Rox brand) with neon
 * cyan / violet / amber accents, echoing Mercury Command's palette while
 * staying on-brand.
 */
export const AGENT_ROLES: ReadonlyArray<AgentRole> = [
	{ label: "Planner", glyph: "🧠", color: "#a855f7" },
	{ label: "Executor", glyph: "🤖", color: "#ff9a4d" },
	{ label: "Researcher", glyph: "🔍", color: "#22d3ee" },
	{ label: "Analyst", glyph: "📊", color: "#eab308" },
	{ label: "Reviewer", glyph: "✅", color: "#6bd3a8" },
];

/** Suggested commands shown as clickable chips under the command input. */
export const COMMAND_SUGGESTIONS: ReadonlyArray<string> = [
	"Исправь баг в авторизации",
	"Напиши тесты для платежей",
	"Отрефактори модуль API",
	"Собери и разверни прод",
];

/** Placeholder for the command composer input. */
export const COMMAND_PLACEHOLDER = "Поставь задачу рою агентов…";

/** Label for the dispatch button. */
export const COMMAND_BUTTON = "Оркестровать";

/**
 * Steps of the mock orchestration run streamed into the dispatch log after a
 * command is sent. Each line is attributed to a role (by index into
 * {@link AGENT_ROLES}) so it picks up that role's accent color.
 */
export const DISPATCH_STEPS: ReadonlyArray<{ role: number; text: string }> = [
	{ role: 0, text: "разбил задачу на подзадачи" },
	{ role: 2, text: "собрал контекст из репозитория" },
	{ role: 1, text: "пишет код в изолированной ветке" },
	{ role: 3, text: "прогоняет тесты" },
	{ role: 4, text: "готово — ждёт твоего ревью" },
];

/** WebGL field tuning (desktop). Mobile/low-power falls back to CSS backdrop. */
export const FIELD = {
	/** Total particle count on capable devices. */
	particleCount: 7200,
	/** Number of glowing delegation edges drawn between hub and ring nodes. */
	edgeCount: 150,
} as const;
