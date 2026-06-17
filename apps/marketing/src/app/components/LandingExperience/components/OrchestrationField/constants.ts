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
	"Построй лендинг и разверни в прод",
	"Перепиши бэкенд на gRPC + тесты",
	"Найди и почини утечку памяти",
	"Мигрируй БД и обнови схему",
];

/**
 * A real, meaningful prompt pre-filled into the composer so the hero shows an
 * actual orchestration request on screen (not just an empty placeholder).
 */
export const COMMAND_EXAMPLE =
	"Построй SaaS-дашборд: схема БД, REST API, React-UI и e2e-тесты — раскидай по 12 агентам и разверни в прод";

/** Placeholder for the command composer input (shown only if cleared). */
export const COMMAND_PLACEHOLDER = "Опиши задачу — рой агентов разберёт её…";

/** Label for the dispatch button. */
export const COMMAND_BUTTON = "Оркестровать";

/** Tagline shown under the subhead in the hero. */
export const FIELD_HINT =
	"Запускай где хочешь: локально, в изолированных песочницах, в частном облаке, на древнейшем пентиуме, и даже на мобилке";

/**
 * Steps of the mock orchestration run streamed into the dispatch log after a
 * command is sent. Each line is attributed to a role (by index into
 * {@link AGENT_ROLES}) so it picks up that role's accent color. Multiple
 * Executor lines read as many agents running in parallel.
 */
export const DISPATCH_STEPS: ReadonlyArray<{ role: number; text: string }> = [
	{ role: 0, text: "разбил задачу на 12 подзадач" },
	{ role: 2, text: "собрал контекст из репозитория" },
	{ role: 1, text: "агент #1 · пишет REST API в ветке feat/api" },
	{ role: 1, text: "агент #2 · верстает React-UI в ветке feat/ui" },
	{ role: 1, text: "агент #3 · готовит миграции БД" },
	{ role: 1, text: "агент #4..#9 · кодят параллельно" },
	{ role: 3, text: "прогоняет e2e-тесты по всем веткам" },
	{ role: 1, text: "агент #10 · чинит упавший линт" },
	{ role: 4, text: "ревьюит диффы и сводит 12 веток" },
	{ role: 4, text: "12 агентов завершили — ждут твоего ревью" },
];

/** WebGL field tuning (desktop). Mobile/low-power falls back to CSS backdrop. */
export const FIELD = {
	/** Total particle count on capable devices (a dense agent swarm). */
	particleCount: 16000,
	/** Number of glowing delegation edges drawn between hub and ring nodes. */
	edgeCount: 220,
} as const;

/**
 * Background "constellation": a portion of the swarm coalesces into the silhouette
 * of the Rox logo girl, sampled from the PNG's alpha channel. These particles sit
 * behind the orchestration rings (variant C: face as backdrop, rings on top),
 * face the camera (no Saturn spin) and read as a faint star portrait.
 */
export const FACE = {
	/** Source image (transparent line-art portrait in /public). */
	src: "/rox-logo-light.png",
	/** Fraction of the total swarm devoted to the face constellation. */
	share: 0.45,
	/** World-space height the portrait is scaled to (width follows aspect). */
	worldHeight: 13,
	/** Pushed back behind the rings so they clearly float in front. */
	baseZ: -7,
	/** Half-thickness of random depth jitter applied to face points. */
	depth: 0.8,
	/** Minimum pixel alpha (0–1) to treat a pixel as part of the silhouette. */
	alphaThreshold: 0.28,
	/** Cap the sampling canvas width to keep getImageData cheap. */
	sampleMaxWidth: 360,
} as const;
