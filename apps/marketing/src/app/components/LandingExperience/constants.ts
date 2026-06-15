/**
 * Content for the Rox One anime.js landing experience.
 *
 * Every string is real Rox product copy (RU). The scramble text reflects
 * shipped capabilities, written benefit-first to read as a selling page rather
 * than a feature dump.
 */

/** Phases of the landing experience state machine. */
export type LandingPhase = "intro" | "main" | "downloading";

/* ── ① Intro overlay (vEyYdXN) ─────────────────────────────────────────── */

/** Word repeated across the opening scramble grid (slide 1). */
export const INTRO_LEAD_WORD = "Представляем";

/** Final brand reveal on slide 1. */
export const INTRO_BRAND = "Rox";

/** Closing line of the intro. */
export const INTRO_TAGLINE = "Создано для эпохи AI-агентов";

/**
 * Feature tags shown as the scramble grid on intro slide 2. Each maps to a Rox
 * capability and gets an accent color slot (`data-color`).
 */
export const INTRO_FEATURE_TAGS: ReadonlyArray<{
	text: string;
	color: number;
}> = [
	{ text: "Сотня агентов сразу", color: 3 },
	{ text: "Параллельный запуск", color: 8 },
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

export const LANDING_HEADLINE = "Кодьте сотней AI-агентов сразу";

export const LANDING_INTRO_PARAGRAPH =
	"Rox превращает вас в команду из 100+ кодинг-агентов прямо на вашей машине. Пока одни пишут фичи, другие чинят баги и рефакторят — а вы лишь проверяете и сливаете лучшее. Наведите на строку, чтобы пересобрать её.";

export const LANDING_FEATURES_HEADING = "Почему Rox";

/** Benefit-first bullets — verbatim Rox value props, ideal for per-line scramble. */
export const LANDING_FEATURES: ReadonlyArray<string> = [
	"Успевайте за день то, на что уходила неделя — десятки агентов работают разом",
	"Любимый агент остаётся с вами: Claude Code, OpenCode, Cursor, Codex, Gemini",
	"Ноль конфликтов: каждая задача изолирована в своём git worktree",
	"Вы — финальный фильтр: проверяете и сливаете только то, что готово",
	"Один клик — worktree открыт в VS Code, Cursor, Xcode или JetBrains",
	"Переключайтесь между агентами мгновенно, не теряя контекст",
];

export const LANDING_HOW_HEADING = "Как это работает";

export const LANDING_HOW_PARAGRAPH =
	"Ставьте задачу за задачей, не дожидаясь. Каждый агент работает в своей ветке асинхронно, а Rox зовёт вас, только когда нужно решение. Вы дирижируете — агенты исполняют.";

export const LANDING_DOWNLOAD_HEADING = "Начните бесплатно прямо сейчас";

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
