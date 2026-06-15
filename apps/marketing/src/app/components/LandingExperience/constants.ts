/**
 * Content for the Rox One anime.js landing experience.
 *
 * Every string is real Rox product copy (RU) drawn from the existing marketing
 * surfaces (FeaturesSection, HeroSection, CTASection) so the scramble text
 * reflects shipped capabilities rather than placeholder demo text.
 */

/** Phases of the landing experience state machine. */
export type LandingPhase = "intro" | "main" | "downloading";

/* ── ① Intro overlay (vEyYdXN) ─────────────────────────────────────────── */

/** Word repeated across the opening scramble grid (slide 1). */
export const INTRO_LEAD_WORD = "Представляем";

/** Final brand reveal on slide 1. */
export const INTRO_BRAND = "Rox One";

/** Closing line of the intro. */
export const INTRO_TAGLINE = "Создано для эпохи AI";

/**
 * Feature tags shown as the scramble grid on intro slide 2. Each maps to a Rox
 * capability and gets an accent color slot (`data-color`).
 */
export const INTRO_FEATURE_TAGS: ReadonlyArray<{
	text: string;
	color: number;
}> = [
	{ text: "Параллельный запуск", color: 3 },
	{ text: "Десятки агентов сразу", color: 8 },
	{ text: "Любой CLI-агент", color: 14 },
	{ text: "Claude Code · Codex", color: 0 },
	{ text: "OpenCode · Cursor", color: 6 },
	{ text: "Изоляция в git worktree", color: 16 },
	{ text: "Ветки не конфликтуют", color: 4 },
	{ text: "Открыть в любой IDE", color: 1 },
	{ text: "VS Code · Xcode", color: 11 },
	{ text: "JetBrains · Terminal", color: 5 },
	{ text: "Проверяй и сливай", color: 2 },
];

/* ── ② Scramble landing document (gbLOvrw) ─────────────────────────────── */

export const LANDING_HEADLINE = "Редактор кода для AI-агентов";

export const LANDING_INTRO_PARAGRAPH =
	"Rox оркестрирует 100+ кодинг-агентов параллельно прямо на вашей машине. Наведите курсор на любую строку, чтобы пересобрать её.";

export const LANDING_FEATURES_HEADING = "Возможности";

/** Feature bullets — verbatim Rox feature copy, ideal for per-line scramble. */
export const LANDING_FEATURES: ReadonlyArray<string> = [
	"Запускайте десятки агентов одновременно для разных задач",
	"Работает с любым CLI-агентом: Claude Code, OpenCode, Cursor, Codex, Gemini",
	"Каждая задача — в собственном git worktree, изменения не мешают друг другу",
	"Проверяйте и сливайте результат, когда он готов",
	"Открывайте worktree в любой IDE: VS Code, Cursor, Xcode, JetBrains",
	"Быстро переключайтесь между агентами и задачами",
];

export const LANDING_HOW_HEADING = "Как это работает";

export const LANDING_HOW_PARAGRAPH =
	"Создавайте новые задачи, пока текущий агент работает. Каждый агент получает асинхронную изоляцию в отдельной ветке, а вы переключаетесь между ними, когда им нужно ваше внимание.";

export const LANDING_DOWNLOAD_HEADING = "Попробуйте Rox прямо сейчас";

/* ── ③ Download Snap X (qEBgEPz) ───────────────────────────────────────── */

export const SNAP_LABEL_IDLE = "Перетащите, чтобы скачать";
export const SNAP_LABEL_ARMED = "Отпустите для загрузки";

/* ── ④ Thank-you + GitHub star button (mydvebj) ────────────────────────── */

export const THANKS_HEADING = "Спасибо за загрузку!";
export const THANKS_HINT =
	"Откройте Rox-arm64.dmg из загрузок, чтобы установить. Загрузка не началась?";
export const STAR_PROMPT = "Поставьте звезду на GitHub";
export const STAR_LABEL_IDLE = "Star";
export const STAR_LABEL_DONE = "Starred";

/**
 * Fallback community star count used to animate the counter when the live
 * GitHub value is unavailable. The real count is passed in from the server.
 */
export const STAR_COUNT_FALLBACK = 12000;
