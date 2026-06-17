/**
 * Content for the Rox One anime.js landing experience.
 *
 * Copy is real Rox product messaging (RU), written benefit-first and in plain
 * language so the scramble text reads as a selling page rather than a feature
 * dump.
 */

/** Phases of the landing experience state machine. */
export type LandingPhase = "intro" | "main";

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
	{ text: "1000+ агентов", color: 0 },
	{ text: "Оркестрация за 1 сек", color: 5 },
	{ text: "Любой CLI-агент", color: 14 },
	{ text: "Claude Code · Codex", color: 0 },
	{ text: "OpenCode · Cursor", color: 6 },
	{ text: "Gemini · OpenClaw", color: 15 },
	{ text: "Hermes · Kimi", color: 9 },
	{ text: "DeepSeek · Qwen", color: 8 },
	{ text: "Zed · Windsurf", color: 11 },
	{ text: "Devin · Copilot", color: 4 },
	{ text: "Grok Build · Mira", color: 5 },
	{ text: "OpenHands · Pi", color: 7 },
	{ text: "Cline · Kilo Code", color: 12 },
	{ text: "BYOM · BYOA · BYOH", color: 1 },
	{ text: "Rox One агент", color: 3 },
	{ text: "acpx · ODW", color: 16 },
	{ text: "Autopilot · Swarm", color: 2 },
	{ text: "Изоляция в git worktree", color: 16 },
	{ text: "Ветки не конфликтуют", color: 4 },
	{ text: "Параллельные worktree", color: 7 },
	{ text: "Без merge-конфликтов", color: 6 },
	{ text: "Проверяй и сливай", color: 2 },
	{ text: "Ревью всех веток", color: 13 },
	{ text: "Дирижируй задачами", color: 3 },
	{ text: "Dispatch log", color: 8 },
	{ text: "Открыть в любой IDE", color: 1 },
	{ text: "VS Code · XCode", color: 11 },
	{ text: "JetBrains · Terminal", color: 5 },
	{ text: "Cursor CLI", color: 0 },
	{ text: "Один клик в редактор", color: 10 },
	{ text: "Локальный запуск", color: 14 },
	{ text: "Изолированные песочницы", color: 7 },
	{ text: "Частное облако", color: 15 },
	{ text: "Tailscale remote", color: 8 },
	{ text: "Desktop + Web", color: 9 },
	{ text: "macOS · Linux", color: 4 },
	{ text: "Terminal-first", color: 5 },
	{ text: "Agent harness", color: 6 },
	{ text: "Skill bundles", color: 1 },
	{ text: "MCP интеграция", color: 12 },
	{ text: "ACP протокол", color: 16 },
	{ text: "Live sync Electric", color: 8 },
	{ text: "Drizzle · Neon", color: 7 },
	{ text: "Turbo monorepo", color: 14 },
	{ text: "Параллельный CI", color: 3 },
	{ text: "E2E в ветках", color: 2 },
	{ text: "Планировщик задач", color: 9 },
	{ text: "Очередь агентов", color: 0 },
	{ text: "Субагенты", color: 10 },
	{ text: "Параллельный diff", color: 13 },
	{ text: "Превью в браузере", color: 15 },
	{ text: "GitHub · Linear", color: 4 },
	{ text: "Open source ELv2", color: 6 },
];

/* ── ② Scramble landing document (gbLOvrw) ─────────────────────────────── */

/** Hero wordmark — wide tracked lockup via pre-spaced letters. */
export const HERO_BRAND_WORDMARK = ["R", "O", "X", "O", "N", "E"].join(
	"                  ",
);

export const LANDING_HEADLINE = "Кодируй и вайбуй в тыщу рук";

/** Hero subhead — line 1 and the static parts of line 2 around the agent cycle. */
export const HERO_SUB_LINE_ONE = "Rox за 1 секунду";
export const HERO_SUB_LINE_TWO_LEAD = "запускает оркестрацию 1000+";
export const HERO_SUB_TAIL = "агентов параллельно";

/** Agent names cycled in the hero subhead (AnimatedTextCycle). */
export const HERO_SUB_AGENT_CYCLE_WORDS: ReadonlyArray<string> = [
	"Claude Code",
	"Codex",
	"Cursor",
	"Grok",
	"Devin",
	"Zed",
	"Kilo Code",
	"OpenClaw",
	"Hermes",
	"Pi",
	"OpenHands",
	"Cline",
	"Kimi",
	"Gemini",
	"Qwen",
	"Windsurf",
	"Copilot",
	"OpenCode",
];

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

/* ── Hero stack line (BYOM / BYOA / BYOH) ─────────────────────────────── */

export const HERO_BYOM_TERMS: ReadonlyArray<LandingTerm> = [
	{
		label: "BYOM",
		tip: "bring your own model — подключай любую модель на своих ключах и лимитах.",
	},
	{
		label: "BYOA",
		tip: "bring your own agent — гоняй привычного CLI-агента от своего аккаунта.",
	},
	{
		label: "BYOH",
		tip: "bring your own harness — накладывай свой skill/harness-слой поверх агента.",
	},
];

export const HERO_STACK_TERM: LandingTerm = {
	label: "стэке",
	tip: "можно выбрать любого привычного тебе агента и любую привычную тебе модель",
};

export const HERO_WORKTREE_TERM: LandingTerm = {
	label: "рабочей ветке",
	tip: "Git worktree — отдельная рабочая копия репозитория в своей папке и ветке: агент пишет код изолированно, не трогая твою основную рабочую директорию.",
};

export const HERO_RUNTIME_TERM: LandingTerm = {
	label: "Рантайм",
	tip: "Всегда и без ограничений доступен выделенный sandbox (1 vCPU 1 RAM 10G SSD); более мощное железо можно арендовать по рыночной цене",
};

export const HERO_LLM_TERM: LandingTerm = {
	label: "LLM",
	tip: "Всегда и без ограничений доступна модель Rox-R1 (MoE, 550 bn параметров, 128K контекстное окно), все остальные модели доступны бесплатно первые 30 дней, дальше придётся башлять по рыночной цене",
};

export const HERO_ROX_ORCHESTRATION_TERM: LandingTerm = {
	label: "легко",
	tip: "для оркестрации используем собственное комбо из ODW (opendynamicworkflows) x ACPX x Autopilot x Swarm",
};

/** Agent names in the hero stack line — each renders as its own underlined hover term. */
export const HERO_AGENT_TERMS: ReadonlyArray<LandingTerm> = [
	{
		label: "Claude Code",
		tip: "Работаем с твоей подпиской Claude Code (Anthropic Agents SDK) — ключи и лимиты остаются твоими.",
	},
	{
		label: "Codex",
		tip: "Запускаем через Codex CLI (OpenAI) на твоём аккаунте.",
	},
	{
		label: "Cursor",
		tip: "Поддерживаем подписку Cursor и Cursor CLI — гоняем агентов Cursor от твоего имени.",
	},
	{
		label: "OpenCode",
		tip: "Поддерживаем OpenCode CLI — открытый агент с твоим выбором моделей.",
	},
	{
		label: "Gemini",
		tip: "Работаем через Gemini CLI (Google) с твоим ключом.",
	},
	{
		label: "OpenClaw",
		tip: "OpenClaw — persona/skill-харнесс поверх Claude Code; Rox гоняет его параллельно в worktree.",
	},
	{
		label: "Hermes",
		tip: "Hermes Agent — самоулучшающийся агент с навыками и крон-задачами; Rox оркестрирует его в общем зоопарке.",
	},
	{
		label: "Kimi",
		tip: "Kimi CLI (Moonshot) — терминальный coding-агент на твоём аккаунте.",
	},
	{
		label: "DeepSeek",
		tip: "DeepSeek — модели и CLI-агент; подключай свои ключи и гоняй параллельно.",
	},
	{
		label: "Qwen",
		tip: "Qwen Code (Alibaba) — читает, правит и запускает код из терминала.",
	},
	{
		label: "Zed",
		tip: "Zed — быстрый редактор с агентом внутри; Rox открывает diff и координирует CLI.",
	},
	{
		label: "Windsurf",
		tip: "Windsurf (Cascade) — IDE-агент от Codeium; Rox запускает его CLI параллельно.",
	},
	{
		label: "Devin",
		tip: "Devin — облачный AI-инженер от Cognition; Rox соседствует с ним в одном оркестре задач.",
	},
	{
		label: "Copilot",
		tip: "GitHub Copilot CLI — агент от GitHub для планирования, правок и сборки в репо.",
	},
	{
		label: "Grok Build",
		tip: "Grok Build — coding-агент от xAI в терминале; твой ключ, твой аккаунт.",
	},
	{
		label: "Mira",
		tip: "Mira — агентский CLI из экосистемы Mira; Rox подключает его как любой другой harness.",
	},
	{
		label: "OpenHands",
		tip: "OpenHands — open-source агент для автономной разработки; Rox гоняет его в изолированной ветке.",
	},
	{
		label: "Pi",
		tip: "Pi — минимальный terminal harness для гибких coding-воркфлоу через ACP.",
	},
	{
		label: "Cline",
		tip: "Cline — агент-расширение для VS Code; Rox координирует его рядом с CLI-агентами.",
	},
	{
		label: "Kilo Code",
		tip: "Kilo Code — форк Cline с расширенными моделями; Rox подключает как отдельного агента.",
	},
];

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
