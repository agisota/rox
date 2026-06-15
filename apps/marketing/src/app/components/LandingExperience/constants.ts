/**
 * Content for the Rox One anime.js landing experience.
 *
 * Copy is real Rox product messaging (RU), written benefit-first and in plain
 * language so the scramble text reads as a selling page rather than a feature
 * dump.
 */

/** Phases of the landing experience state machine. */
export type LandingPhase = "intro" | "main" | "downloading";

/* ── ① Intro overlay (vEyYdXN) ─────────────────────────────────────────── */

/** Centre word of the opening grid (the "native" language), collapses to brand. */
export const INTRO_LEAD_WORD = "Представляем";

/**
 * "Introducing" across many languages — the intro grid fills the screen with
 * these so the reveal reads as a global launch rather than one repeated word.
 */
export const INTRO_LANGS: ReadonlyArray<string> = [
	"Introducing",
	"Представляем",
	"Presentamos",
	"Présentation",
	"Vorstellung",
	"紹介します",
	"介绍",
	"소개합니다",
	"Apresentando",
	"Presentiamo",
	"نقدّم",
	"प्रस्तुत है",
	"Tanıtıyoruz",
	"Wprowadzamy",
	"Giới thiệu",
	"Memperkenalkan",
	"การแนะนำ",
	"Представляємо",
	"Voici",
	"يقدّم",
	"Introducing",
	"Представляем",
	"紹介",
];

/** Final brand reveal on slide 1 (uppercase wordmark). */
export const INTRO_BRAND = "ROX";

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

export const LANDING_HEADLINE = "Кодируй и вайбуй в тыщу рук";

export const LANDING_INTRO_PARAGRAPH =
	"ROX оркестрирует 1000+ AI-агентов параллельно.";

export const LANDING_FEATURES_HEADING = "Почему ROX";

/** Plain-language, benefit-first value props — ideal for per-line scramble. */
export const LANDING_FEATURES: ReadonlyArray<string> = [
	"Неделя работы — за день: десятки агентов кодят одновременно",
	"Любой агент на выбор: Claude Code, Cursor, Codex, Gemini, OpenCode",
	"Агенты не мешают друг другу — каждый в своей изолированной ветке",
	"Вы решаете, что попадёт в проект — принимаете только готовое",
	"Открывайте результат в своём редакторе одним кликом: VS Code, Cursor, Xcode",
	"Переключайтесь между задачами мгновенно, ничего не теряя",
];

export const LANDING_HOW_HEADING = "Как это работает";

export const LANDING_HOW_PARAGRAPH =
	"Ставьте задачи одну за другой, не дожидаясь. Каждый агент работает сам в своей ветке, а ROX зовёт вас, только когда нужно ваше решение. Вы дирижируете — агенты пишут код.";

export const LANDING_DOWNLOAD_HEADING = "Попробуйте ROX бесплатно";

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
