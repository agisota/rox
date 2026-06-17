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
	{ text: "VS Code · XCode", color: 11 },
	{ text: "JetBrains · Terminal", color: 5 },
	{ text: "Проверяй и сливай", color: 2 },
];

/* ── ② Scramble landing document (gbLOvrw) ─────────────────────────────── */

export const LANDING_HEADLINE = "Кодируй и вайбуй в тыщу рук";

export const LANDING_INTRO_PARAGRAPH =
	"Rox за 1 секунду запускает оркестрацию 1000+ агентов параллельно";

export const LANDING_FEATURES_HEADING = "Почему ROX";

/**
 * Plain-language, benefit-first value props. Most lines scramble in per-line;
 * the agent and editor lines carry inline glossary terms (underlined, with a
 * hover tooltip), so they're rendered as JSX in ScrambleLanding instead of as a
 * flat string — scrambleText rewrites innerHTML and would wipe the spans.
 */
export const LANDING_FEAT_SPEED =
	"Неделя работы — за день: десятки агентов кодят одновременно";
export const LANDING_FEAT_ISOLATION =
	"Агенты не мешают друг другу: каждый решает вопросики в своей рабочей ветке — без ошибок, пересечений и конфликтов";
export const LANDING_FEAT_CONTROL =
	"Ты решаешь, что попадёт в проект — принимаешь только готовое";
export const LANDING_FEAT_SWITCH =
	"Переключайся между задачами мгновенно, ничего не теряя";

/** A glossary term: an underlined word with a hover/focus tooltip. */
export interface LandingTerm {
	label: string;
	tip: string;
}

/** Lead-in for the "any agent" line; agent names render as {@link LandingTerm}s. */
export const LANDING_AGENT_LEAD = "Любой агент на выбор:";
export const LANDING_AGENT_TERMS: ReadonlyArray<LandingTerm> = [
	{
		label: "Claude Code",
		tip: "Работаем с твоей подпиской Claude Code (Anthropic Agents SDK) — ключи и лимиты остаются твоими.",
	},
	{
		label: "Cursor",
		tip: "Поддерживаем подписку Cursor и Cursor CLI — гоняем агентов Cursor от твоего имени.",
	},
	{
		label: "Codex",
		tip: "Запускаем через Codex CLI (OpenAI) на твоём аккаунте.",
	},
	{
		label: "Gemini",
		tip: "Работаем через Gemini CLI (Google) с твоим ключом.",
	},
	{
		label: "OpenCode",
		tip: "Поддерживаем OpenCode CLI — открытый агент с твоим выбором моделей.",
	},
];

/** Tail after the agent list: orchestration runs through acpx. */
export const LANDING_AGENT_TAIL = " — оркеструем через ";
export const LANDING_ACPX_TERM: LandingTerm = {
	label: "acpx",
	tip: "acpx — наш слой оркестрации: раскидывает задачи по агентам и git-worktree, запускает их параллельно и сводит результат воедино.",
};

/** Lead-in for the "open in editor" line; editor names render as terms. */
export const LANDING_EDITOR_LEAD =
	"Открывай результат в своём редакторе одним кликом:";
export const LANDING_EDITOR_TERMS: ReadonlyArray<LandingTerm> = [
	{
		label: "VS Code",
		tip: "Открываем прямо в VS Code через его CLI (code .).",
	},
	{ label: "Cursor", tip: "Открываем в Cursor через его CLI (cursor .)." },
	{
		label: "XCode",
		tip: "Открываем в XCode через xed — для Swift / iOS-проектов.",
	},
	{ label: "Zed", tip: "Открываем в Zed (zed.dev) через его CLI (zed .)." },
	{
		label: "Windsurf",
		tip: "Открываем в Windsurf через его CLI (windsurf .).",
	},
];

export const LANDING_HOW_HEADING = "Как это работает";

export const LANDING_HOW_PARAGRAPH =
	"Ставь задачи одну за другой, не дожидаясь. Каждый агент работает сам в своей ветке, а ROX зовёт тебя, только когда нужно твоё решение. Ты дирижируешь — агенты пишут код.";

export const LANDING_DOWNLOAD_HEADING = "Попробуй ROX бесплатно";

/* ── ③ Download Snap X (qEBgEPz) ───────────────────────────────────────── */

export const SNAP_LABEL_IDLE = "Перетащи, чтобы скачать";
export const SNAP_LABEL_ARMED = "Отпусти для загрузки";

/* ── ④ Thank-you + GitHub star button (mydvebj) ────────────────────────── */

export const THANKS_HEADING = "Спасибо за загрузку!";
export const THANKS_HINT =
	"Открой Rox-arm64.dmg из загрузок, чтобы установить. Загрузка не началась?";
export const STAR_PROMPT = "Поставь звезду на GitHub";
export const STAR_LABEL_IDLE = "Star";
export const STAR_LABEL_DONE = "Starred";

/**
 * Fallback community star count used to animate the counter when the live
 * GitHub value is unavailable. The real count is passed in from the server.
 */
export const STAR_COUNT_FALLBACK = 12000;
