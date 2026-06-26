/**
 * Curated default skill set — the SINGLE source of truth for Rox's
 * preinstalled skills, shared across every platform (host-service reference
 * metadata + desktop bundled-catalog build).
 *
 * This replaces the legacy 985-skill snapshot default. Both pipelines derive
 * from these two constants — there are NO duplicated skill literals anywhere
 * else in the monorepo.
 *
 * - {@link CURATED_DEFAULT_SKILL_PACKS}: one row per source repo, used for the
 *   reference-only DEFAULT_SKILLS rows that surface in the Навыки tab before
 *   bundled archives are available.
 * - {@link CURATED_DEFAULT_SKILLS}: the flattened individual skills (with the
 *   in-repo subpath) that drive the bundled-catalog archive rebuild so that a
 *   desktop install lands EXACTLY this set into ~/.claude/skills.
 */

/** A curated source repo (one per GitHub repository). */
export type CuratedDefaultSkillPack = {
	/** Display slug. */
	name: string;
	/** Source GitHub repo, e.g. `github.com/obra/superpowers`. */
	repo: `github.com/${string}/${string}`;
	description: string;
};

/** A single curated skill, flattened from its source pack. */
export type CuratedDefaultSkill = {
	/** Skill directory name installed under ~/.claude/skills/<name>. */
	name: string;
	/** Source GitHub repo, e.g. `github.com/obra/superpowers`. */
	repo: `github.com/${string}/${string}`;
	/** Path to the skill directory inside the source repo. */
	subpath: string;
	description: string;
};

export const CURATED_DEFAULT_SKILL_PACKS: readonly CuratedDefaultSkillPack[] = [
	{
		name: "superpowers",
		repo: "github.com/obra/superpowers",
		description:
			"Фреймворк агентных навыков и методология разработки ПО: планирование, TDD, отладка, ревью, git-воркфлоу.",
	},
	{
		name: "taste-skill",
		repo: "github.com/Leonxlnx/taste-skill",
		description:
			"Скиллы «хорошего вкуса» для AI: блокируют генерацию скучного шаблонного фронтенда (gpt-taste и др.).",
	},
	{
		name: "claude-autonomy-kit",
		repo: "github.com/lukeselr/claude-autonomy-kit",
		description:
			"4 скилла Claude Code: стресс-тест плана через допрос (grill/drill) и автономный цикл сборки до цели.",
	},
	{
		name: "claudesidian",
		repo: "github.com/heyitsnoah/claudesidian",
		description:
			"Obsidian-центричный набор; включает thinking-partner — партнёра по мышлению, ведущего через вопросы.",
	},
	{
		name: "oh-my-claudecode",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		description:
			"Мульти-агентная оркестрация для Claude Code: автопилот, ralph, команды, планирование, ревью и QA (~39 скиллов).",
	},
	{
		name: "oh-my-codex",
		repo: "github.com/scalarian/oh-my-codex",
		description:
			"Слой оркестрации для OpenAI Codex CLI: план/исполнение/проверка, ревью, команды агентов, состояние и память.",
	},
	{
		name: "open-dynamic-workflows",
		repo: "github.com/xz1220/open-dynamic-workflows",
		description:
			"Рантайм odw: JS-скрипты раздают подзадачи внешним coding-agent CLI (Codex, Claude Code, Gemini, Qwen, Kimi).",
	},
	{
		name: "understand-anything",
		repo: "github.com/Egonex-AI/Understand-Anything",
		description:
			"Пак анализа кодовой базы через интерактивный граф знаний: архитектура, домен, диффы, онбординг.",
	},
	{
		name: "graphify",
		repo: "github.com/safishamsi/graphify",
		description:
			"Превращает любую папку (код, схемы, доки, медиа) в запрашиваемый навигируемый граф знаний.",
	},
	{
		name: "improve",
		repo: "github.com/shadcn/improve",
		description:
			"Аудит репозитория дорогой моделью и генерация самодостаточных планов для дешёвых агентов (read-only).",
	},
	{
		name: "agent-skills-vercel",
		repo: "github.com/vercel-labs/agent-skills",
		description:
			"Официальные agent-скиллы Vercel: React/Next.js, React Native, дизайн, деплой и оптимизация на Vercel.",
	},
	{
		name: "gstack",
		repo: "github.com/garrytan/gstack",
		description:
			"Набор инструментов Гарри Тана: роли CEO/дизайнера/eng-менеджера, release/doc-инженера, QA и iOS (~56 скиллов).",
	},
	{
		name: "mattpocock-skills",
		repo: "github.com/mattpocock/skills",
		description:
			"Инженерный набор Matt Pocock: проектирование модулей, TDD, диагностика багов, PRD/issues, code-review.",
	},
	{
		name: "agent-skills-addyosmani",
		repo: "github.com/addyosmani/agent-skills",
		description:
			"Production-grade инженерные навыки для AI-агентов: дизайн API, тестирование, ревью, отладка, спеки, безопасность.",
	},
	{
		name: "garden-skills",
		repo: "github.com/ConardLi/garden-skills",
		description:
			"Скиллы ConardLi: веб-дизайн, генерация изображений, поиск по базе знаний, оформление статей и видео-презентаций.",
	},
	{
		name: "reverse-skill",
		repo: "github.com/zhaoxuya520/reverse-skill",
		description:
			"Узкоспециализированный пак реверс-инжиниринга, авторизованного пентеста и CTF (~62 скилла) — нужен ручной отбор.",
	},
	{
		name: "last30days-skill",
		repo: "github.com/mvanhorn/last30days-skill",
		description:
			"Исследование того, что реально говорят о теме за 30 дней (Reddit, X, YouTube, TikTok, HN, Polymarket, GitHub, веб).",
	},
	{
		name: "pm-skills",
		repo: "github.com/phuryn/pm-skills",
		description:
			"Маркетплейс из 67 PM-скиллов: дискавери, исследование рынка, стратегия, исполнение, запуск и рост.",
	},
	{
		name: "obsidian-skills",
		repo: "github.com/kepano/obsidian-skills",
		description:
			"Навыки для Obsidian: извлечение веб-контента, JSON Canvas, Bases, CLI и Obsidian-разметка.",
	},
	{
		name: "claude-skills",
		repo: "github.com/alirezarezvani/claude-skills",
		description:
			"Мультидоменный агрегатор на 420 скиллов (инженерия, маркетинг, продукт, C-level, исследования) — точечный импорт.",
	},
	{
		name: "ui-ux-pro-max-skill",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		description:
			"Пак дизайн-интеллекта UI/UX: стили, палитры, шрифты, токены, брендинг, баннеры и слайды для web и mobile.",
	},
] as const;

export const CURATED_DEFAULT_SKILLS: readonly CuratedDefaultSkill[] = [
	{
		name: "brainstorming",
		repo: "github.com/obra/superpowers",
		subpath: "skills/brainstorming",
		description:
			"Обязательно перед любой творческой работой: исследует намерение, требования и дизайн до реализации.",
	},
	{
		name: "dispatching-parallel-agents",
		repo: "github.com/obra/superpowers",
		subpath: "skills/dispatching-parallel-agents",
		description:
			"Параллельный запуск агентов при 2+ независимых задачах без общего состояния.",
	},
	{
		name: "executing-plans",
		repo: "github.com/obra/superpowers",
		subpath: "skills/executing-plans",
		description:
			"Исполнение готового плана реализации в отдельной сессии с контрольными точками ревью.",
	},
	{
		name: "finishing-a-development-branch",
		repo: "github.com/obra/superpowers",
		subpath: "skills/finishing-a-development-branch",
		description:
			"Завершение ветки: структурированный выбор merge/PR/cleanup после прохождения тестов.",
	},
	{
		name: "receiving-code-review",
		repo: "github.com/obra/superpowers",
		subpath: "skills/receiving-code-review",
		description:
			"Приём фидбэка ревью с технической строгостью и верификацией вместо слепого согласия.",
	},
	{
		name: "requesting-code-review",
		repo: "github.com/obra/superpowers",
		subpath: "skills/requesting-code-review",
		description:
			"Запрос ревью при завершении задач/фич перед мержем для проверки соответствия требованиям.",
	},
	{
		name: "subagent-driven-development",
		repo: "github.com/obra/superpowers",
		subpath: "skills/subagent-driven-development",
		description:
			"Исполнение плана с независимыми задачами через сабагентов в текущей сессии.",
	},
	{
		name: "systematic-debugging",
		repo: "github.com/obra/superpowers",
		subpath: "skills/systematic-debugging",
		description:
			"Систематическая отладка любого бага/падения теста до предложения фиксов.",
	},
	{
		name: "test-driven-development",
		repo: "github.com/obra/superpowers",
		subpath: "skills/test-driven-development",
		description: "TDD: тесты до кода реализации для любой фичи или багфикса.",
	},
	{
		name: "using-git-worktrees",
		repo: "github.com/obra/superpowers",
		subpath: "skills/using-git-worktrees",
		description:
			"Изолированное рабочее пространство через git worktree для feature-работы.",
	},
	{
		name: "using-superpowers",
		repo: "github.com/obra/superpowers",
		subpath: "skills/using-superpowers",
		description:
			"Мета-навык: как находить и применять навыки из пакета superpowers.",
	},
	{
		name: "verification-before-completion",
		repo: "github.com/obra/superpowers",
		subpath: "skills/verification-before-completion",
		description:
			"Верификация результата свежими доказательствами перед заявлением о готовности.",
	},
	{
		name: "writing-plans",
		repo: "github.com/obra/superpowers",
		subpath: "skills/writing-plans",
		description:
			"Написание плана реализации многошаговой задачи до правок кода.",
	},
	{
		name: "writing-skills",
		repo: "github.com/obra/superpowers",
		subpath: "skills/writing-skills",
		description:
			"Создание и оформление новых навыков (SKILL.md) для фреймворка.",
	},
	{
		name: "gpt-taste",
		repo: "github.com/Leonxlnx/taste-skill",
		subpath: "skills/gpt-tasteskill",
		description:
			"Элитный UX/UI и GSAP motion-инженер: рандомизация лейаута, AIDA, редакторская типографика, bento-сетки, ScrollTrigger.",
	},
	{
		name: "grill-with-docs",
		repo: "github.com/lukeselr/claude-autonomy-kit",
		subpath: "skills/grill-with-docs",
		description:
			"Допрос-сессия, проверяющая план против доменной модели и обновляющая документацию (CONTEXT.md, ADR).",
	},
	{
		name: "grill-me",
		repo: "github.com/lukeselr/claude-autonomy-kit",
		subpath: "skills/grill-me",
		description:
			"Безжалостный допрос по плану/дизайну до общего понимания, по одной ветке дерева решений за раз.",
	},
	{
		name: "drill-me",
		repo: "github.com/lukeselr/claude-autonomy-kit",
		subpath: "skills/drill-me",
		description:
			"Резолвер решений по одному вопросу с рекомендацией; режимы INTERACTIVE и AUTOPILOT с гейтами на деньги/легал/деструктив.",
	},
	{
		name: "autopilot-loop",
		repo: "github.com/lukeselr/claude-autonomy-kit",
		subpath: "skills/autopilot-loop",
		description:
			"Превращает Claude Code/Codex в долгоживущего автономного агента: выбор задачи, авто-решения, сборка, верификация, коммит, повтор.",
	},
	{
		name: "thinking-partner",
		repo: "github.com/heyitsnoah/claudesidian",
		subpath: ".agents/skills/thinking-partner",
		description:
			"Совместный партнёр по мышлению: исследует сложные проблемы через вопросы; для размышлений вслух и стратегического планирования.",
	},
	{
		name: "ai-slop-cleaner",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ai-slop-cleaner",
		description:
			"Чистка AI-слопа с deletion-first рефакторингом и режимом только-ревью.",
	},
	{
		name: "ask",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ask",
		description:
			"Роутинг советника Claude/Codex/Gemini через omc ask с захватом артефактов.",
	},
	{
		name: "autopilot",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/autopilot",
		description: "Полное автономное исполнение от идеи до рабочего кода.",
	},
	{
		name: "autoresearch",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/autoresearch",
		description:
			"Stateful цикл улучшений со строгим контрактом оценщика и логом решений.",
	},
	{
		name: "cancel",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/cancel",
		description:
			"Отмена любого активного режима OMC (autopilot, ralph, team и т.д.).",
	},
	{
		name: "ccg",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ccg",
		description:
			"Триоркестрация Claude-Codex-Gemini с синтезом результата Claude.",
	},
	{
		name: "configure-notifications",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/configure-notifications",
		description:
			"Настройка уведомлений Telegram/Discord/Slack на естественном языке.",
	},
	{
		name: "debug",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/debug",
		description: "Диагностика сессии/репо по логам, трейсам и воспроизведению.",
	},
	{
		name: "deep-dive",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/deep-dive",
		description:
			"Пайплайн trace -> deep-interview для причинного анализа и требований.",
	},
	{
		name: "deep-interview",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/deep-interview",
		description:
			"Сократическое интервью с математическим гейтом неоднозначности.",
	},
	{
		name: "deepinit",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/deepinit",
		description: "Глубокая инициализация кодовой базы с иерархией AGENTS.md.",
	},
	{
		name: "external-context",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/external-context",
		description: "Параллельный поиск в вебе и документации через агентов.",
	},
	{
		name: "hud",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/hud",
		description: "Настройка отображения HUD (layout, пресеты, элементы).",
	},
	{
		name: "learner",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/learner",
		description: "Извлечение выученного скилла из текущего диалога.",
	},
	{
		name: "local-build-reminder",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/local-build-reminder",
		description:
			"Напоминание пересобрать OMC после правок TypeScript в локальном форке.",
	},
	{
		name: "mcp-setup",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/mcp-setup",
		description: "Настройка популярных MCP-серверов.",
	},
	{
		name: "omc-doctor",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/omc-doctor",
		description: "Диагностика и починка установки oh-my-claudecode.",
	},
	{
		name: "omc-reference",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/omc-reference",
		description:
			"Каталог агентов, инструментов, роутинг команд и реестр скиллов OMC.",
	},
	{
		name: "omc-setup",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/omc-setup",
		description: "Установка/обновление OMC для plugin/npm/local-dev.",
	},
	{
		name: "omc-teams",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/omc-teams",
		description: "CLI-команды воркеров claude/codex/gemini в tmux.",
	},
	{
		name: "plan",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/plan",
		description: "Стратегическое планирование с опциональным интервью.",
	},
	{
		name: "project-session-manager",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/project-session-manager",
		description:
			"Worktree-first менеджер dev-окружений для issue/PR/фич с tmux.",
	},
	{
		name: "ralph",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ralph",
		description: "Самоссылочный цикл до завершения задачи с верификацией.",
	},
	{
		name: "ralplan",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ralplan",
		description:
			"Consensus-планирование, гейтит расплывчатые ralph/autopilot/team.",
	},
	{
		name: "release",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/release",
		description:
			"Релиз-ассистент: анализ правил релиза и кэш в RELEASE_RULE.md.",
	},
	{
		name: "remember",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/remember",
		description:
			"Решает что записать в память проекта, notepad или долговременные доки.",
	},
	{
		name: "sciomc",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/sciomc",
		description:
			"Параллельные scientist-агенты для комплексного анализа с AUTO-режимом.",
	},
	{
		name: "self-improve",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/self-improve",
		description: "Эволюционное улучшение кода с турнирной селекцией.",
	},
	{
		name: "setup",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/setup",
		description:
			"Точка входа для установки/обновления и роутинга setup/doctor/MCP.",
	},
	{
		name: "skill",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/skill",
		description: "Управление локальными скиллами: list/add/remove/search/edit.",
	},
	{
		name: "skillify",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/skillify",
		description:
			"Превращение повторяемого workflow из сессии в драфт OMC-скилла.",
	},
	{
		name: "team",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/team",
		description:
			"N координируемых агентов на общем списке задач через native teams.",
	},
	{
		name: "trace",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/trace",
		description:
			"Evidence-driven трейсинг с конкурирующими гипотезами в team-режиме.",
	},
	{
		name: "ultragoal",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ultragoal",
		description:
			"Целеориентированный исполнительный режим OMC (хранит plan/ledger в .omc/ultragoal).",
	},
	{
		name: "ultraqa",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ultraqa",
		description: "QA-цикл: тест, верификация, фикс до достижения цели.",
	},
	{
		name: "ultrawork",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/ultrawork",
		description:
			"Движок параллельного исполнения для высокой пропускной способности (fan-out независимых работ).",
	},
	{
		name: "verify",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/verify",
		description:
			"Проверка что изменение реально работает до заявления о завершении.",
	},
	{
		name: "visual-verdict",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/visual-verdict",
		description: "Структурный визуальный QA-вердикт screenshot-vs-reference.",
	},
	{
		name: "wiki",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/wiki",
		description: "Персистентная markdown-вики проекта с keyword-поиском.",
	},
	{
		name: "writer-memory",
		repo: "github.com/Yeachan-Heo/oh-my-claudecode",
		subpath: "skills/writer-memory",
		description: "Память для писателей: персонажи, связи, сцены, темы.",
	},
	{
		name: "architect",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/architect",
		description:
			"Режим картирования границ для инвазивных изменений, новых интерфейсов и рискованных tradeoff'ов.",
	},
	{
		name: "executor",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/executor",
		description:
			"Сфокусированная реализация одного запланированного среза с явной проверкой и хендоффом.",
	},
	{
		name: "research",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/research",
		description:
			"Evidence-first исследование актуальных паттернов, рисков реализации и поддержки решений.",
	},
	{
		name: "review",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/review",
		description:
			"Pre-landing ревью по коду, полноте плана, доказательствам проверки и состоянию рантайма.",
	},
	{
		name: "reviewer",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/reviewer",
		description:
			"Выделенная линия верификации: применяет протокол ревью и фиксирует approval или запрос правок.",
	},
	{
		name: "tdd",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/tdd",
		description:
			"Red-green-refactor для поведения с чёткими входами/выходами и регрессионной ценностью.",
	},
	{
		name: "doctor",
		repo: "github.com/scalarian/oh-my-codex",
		subpath: "skills/doctor",
		description:
			"Health-check установки OMX, состояния репо, проводки плагинов, хуков и деградации рантайма.",
	},
	{
		name: "open-dynamic-workflows",
		repo: "github.com/xz1220/open-dynamic-workflows",
		subpath: "skill",
		description:
			"Пишет и запускает динамические воркфлоу (JS-диалект Claude Code) через CLI odw: fan-out, пайплайны, адверсариальная верификация, loop-until-done.",
	},
	{
		name: "understand",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand",
		description:
			"Анализ кодовой базы и построение интерактивного графа знаний (архитектура, компоненты, связи).",
	},
	{
		name: "understand-chat",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-chat",
		description: "Вопросы по кодовой базе с опорой на граф знаний.",
	},
	{
		name: "understand-dashboard",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-dashboard",
		description: "Запуск веб-дашборда для визуализации графа знаний.",
	},
	{
		name: "understand-diff",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-diff",
		description:
			"Анализ git-диффов и PR: что изменилось, затронутые компоненты, риски.",
	},
	{
		name: "understand-domain",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-domain",
		description:
			"Извлечение бизнес-домена и граф доменных потоков (standalone или из графа /understand).",
	},
	{
		name: "understand-explain",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-explain",
		description: "Глубокое объяснение конкретного файла, функции или модуля.",
	},
	{
		name: "understand-knowledge",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-knowledge",
		description:
			"Граф знаний из LLM-вики (паттерн Karpathy): сущности, связи, кластеры тем.",
	},
	{
		name: "understand-onboard",
		repo: "github.com/Egonex-AI/Understand-Anything",
		subpath: "understand-anything-plugin/skills/understand-onboard",
		description: "Генерация онбординг-гайда для новых участников проекта.",
	},
	{
		name: "graphify",
		repo: "github.com/safishamsi/graphify",
		subpath: "graphify",
		description:
			"Строит навигируемый граф знаний из любых файлов с community detection и query/path/explain; HTML + GraphRAG JSON + отчёт.",
	},
	{
		name: "improve",
		repo: "github.com/shadcn/improve",
		subpath: "skills/improve",
		description:
			"Сеньор-советник: ревизует репозиторий read-only, находит приоритетные улучшения и пишет готовые планы для других агентов.",
	},
	{
		name: "composition-patterns",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/composition-patterns",
		description:
			"Масштабируемые паттерны композиции React (compound components, render props, context, React 19).",
	},
	{
		name: "deploy-to-vercel",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/deploy-to-vercel",
		description:
			"Деплой приложений и сайтов на Vercel с получением ссылки и preview-деплоями.",
	},
	{
		name: "react-best-practices",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/react-best-practices",
		description:
			"Гайдлайны Vercel по производительности React/Next.js (data fetching, bundle, оптимизация).",
	},
	{
		name: "react-native-skills",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/react-native-skills",
		description:
			"Best practices React Native и Expo: производительные списки, анимации, нативные модули.",
	},
	{
		name: "react-view-transitions",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/react-view-transitions",
		description:
			"Реализация плавных анимаций через React View Transition API (переходы страниц, shared element, Next.js).",
	},
	{
		name: "vercel-cli-with-tokens",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/vercel-cli-with-tokens",
		description:
			"Деплой и управление проектами Vercel через token-based аутентификацию CLI вместо интерактивного логина.",
	},
	{
		name: "vercel-optimize",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/vercel-optimize",
		description:
			"Оптимизация стоимости и производительности Vercel-проектов на основе метрик (Next.js, SvelteKit, Nuxt, Astro).",
	},
	{
		name: "web-design-guidelines",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/web-design-guidelines",
		description:
			"Ревью UI-кода на соответствие Web Interface Guidelines: доступность, UX, дизайн-аудит.",
	},
	{
		name: "writing-guidelines",
		repo: "github.com/vercel-labs/agent-skills",
		subpath: "skills/writing-guidelines",
		description:
			"Ревью документации и текста на соответствие Writing Guidelines (стиль, voice and tone).",
	},
	{
		name: "autoplan",
		repo: "github.com/garrytan/gstack",
		subpath: "autoplan",
		description:
			"Авто-пайплайн ревью: последовательно CEO/design/eng/DX-ревью с авто-решениями.",
	},
	{
		name: "benchmark-models",
		repo: "github.com/garrytan/gstack",
		subpath: "benchmark-models",
		description: "Кросс-модельный бенчмарк skills gstack.",
	},
	{
		name: "benchmark",
		repo: "github.com/garrytan/gstack",
		subpath: "benchmark",
		description: "Детект регрессий производительности через browse-демон.",
	},
	{
		name: "browse",
		repo: "github.com/garrytan/gstack",
		subpath: "browse",
		description: "Быстрый headless-браузер для QA и догфудинга сайта.",
	},
	{
		name: "canary",
		repo: "github.com/garrytan/gstack",
		subpath: "canary",
		description: "Канареечный мониторинг после деплоя.",
	},
	{
		name: "careful",
		repo: "github.com/garrytan/gstack",
		subpath: "careful",
		description: "Защитные guardrails для деструктивных команд.",
	},
	{
		name: "codex",
		repo: "github.com/garrytan/gstack",
		subpath: "codex",
		description: "Обёртка OpenAI Codex CLI — три режима.",
	},
	{
		name: "context-restore",
		repo: "github.com/garrytan/gstack",
		subpath: "context-restore",
		description:
			"Восстановление рабочего контекста, сохранённого /context-save.",
	},
	{
		name: "context-save",
		repo: "github.com/garrytan/gstack",
		subpath: "context-save",
		description: "Сохранение рабочего контекста.",
	},
	{
		name: "cso",
		repo: "github.com/garrytan/gstack",
		subpath: "cso",
		description: "Режим Chief Security Officer.",
	},
	{
		name: "design-consultation",
		repo: "github.com/garrytan/gstack",
		subpath: "design-consultation",
		description:
			"Дизайн-консультация: исследование и полная дизайн-система с превью.",
	},
	{
		name: "design-html",
		repo: "github.com/garrytan/gstack",
		subpath: "design-html",
		description: "Финализация дизайна в production HTML/CSS (Pretext-native).",
	},
	{
		name: "design-review",
		repo: "github.com/garrytan/gstack",
		subpath: "design-review",
		description:
			"QA глазами дизайнера: ищет визуальные несоответствия и AI-slop, чинит.",
	},
	{
		name: "design-shotgun",
		repo: "github.com/garrytan/gstack",
		subpath: "design-shotgun",
		description: "Генерация нескольких дизайн-вариантов и сравнительная доска.",
	},
	{
		name: "devex-review",
		repo: "github.com/garrytan/gstack",
		subpath: "devex-review",
		description: "Живой аудит developer experience.",
	},
	{
		name: "diagram",
		repo: "github.com/garrytan/gstack",
		subpath: "diagram",
		description: "Из текста/mermaid в триплет диаграмм (включая .excalidraw).",
	},
	{
		name: "document-generate",
		repo: "github.com/garrytan/gstack",
		subpath: "document-generate",
		description: "Генерация отсутствующей документации с нуля.",
	},
	{
		name: "document-release",
		repo: "github.com/garrytan/gstack",
		subpath: "document-release",
		description: "Обновление документации после релиза.",
	},
	{
		name: "freeze",
		repo: "github.com/garrytan/gstack",
		subpath: "freeze",
		description: "Ограничение правок файлов одной директорией на сессию.",
	},
	{
		name: "gstack-upgrade",
		repo: "github.com/garrytan/gstack",
		subpath: "gstack-upgrade",
		description: "Обновление gstack до последней версии.",
	},
	{
		name: "guard",
		repo: "github.com/garrytan/gstack",
		subpath: "guard",
		description: "Полный safety-режим: предупреждения + scope правок.",
	},
	{
		name: "health",
		repo: "github.com/garrytan/gstack",
		subpath: "health",
		description: "Дашборд качества кода.",
	},
	{
		name: "investigate",
		repo: "github.com/garrytan/gstack",
		subpath: "investigate",
		description: "Систематический дебаг с поиском корневой причины.",
	},
	{
		name: "ios-clean",
		repo: "github.com/garrytan/gstack",
		subpath: "ios-clean",
		description: "Удаление DebugBridge SPM и #if DEBUG из iOS-приложения.",
	},
	{
		name: "ios-design-review",
		repo: "github.com/garrytan/gstack",
		subpath: "ios-design-review",
		description:
			"Визуальный дизайн-аудит iOS-приложений на реальном устройстве.",
	},
	{
		name: "ios-fix",
		repo: "github.com/garrytan/gstack",
		subpath: "ios-fix",
		description: "Автономный фиксер багов iOS.",
	},
	{
		name: "ios-qa",
		repo: "github.com/garrytan/gstack",
		subpath: "ios-qa",
		description: "Live-device QA для SwiftUI-приложений.",
	},
	{
		name: "ios-sync",
		repo: "github.com/garrytan/gstack",
		subpath: "ios-sync",
		description: "Регенерация iOS debug-bridge под актуальные шаблоны gstack.",
	},
	{
		name: "land-and-deploy",
		repo: "github.com/garrytan/gstack",
		subpath: "land-and-deploy",
		description: "Воркфлоу land и деплой.",
	},
	{
		name: "landing-report",
		repo: "github.com/garrytan/gstack",
		subpath: "landing-report",
		description: "Read-only дашборд очереди для workspace-aware ship.",
	},
	{
		name: "learn",
		repo: "github.com/garrytan/gstack",
		subpath: "learn",
		description: "Управление проектными learnings.",
	},
	{
		name: "make-pdf",
		repo: "github.com/garrytan/gstack",
		subpath: "make-pdf",
		description: "Markdown в публикационный PDF.",
	},
	{
		name: "office-hours",
		repo: "github.com/garrytan/gstack",
		subpath: "office-hours",
		description: "YC Office Hours — два режима.",
	},
	{
		name: "qa",
		repo: "github.com/garrytan/gstack",
		subpath: "qa",
		description: "Систематический QA веб-приложения с починкой багов.",
	},
	{
		name: "qa-only",
		repo: "github.com/garrytan/gstack",
		subpath: "qa-only",
		description: "QA-тестирование только с отчётом, без правок.",
	},
	{
		name: "ship",
		repo: "github.com/garrytan/gstack",
		subpath: "ship",
		description:
			"Ship-воркфлоу: merge base, тесты, ревью, bump VERSION, changelog.",
	},
	{
		name: "spec",
		repo: "github.com/garrytan/gstack",
		subpath: "spec",
		description:
			"Превращение размытого интента в точный исполнимый spec за 5 фаз.",
	},
	{
		name: "scrape",
		repo: "github.com/garrytan/gstack",
		subpath: "scrape",
		description: "Извлечение данных с веб-страницы.",
	},
	{
		name: "retro",
		repo: "github.com/garrytan/gstack",
		subpath: "retro",
		description: "Еженедельная инженерная ретроспектива.",
	},
	{
		name: "ask-matt",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/ask-matt",
		description:
			"Роутер по user-invoked скиллам репозитория: подсказывает, какой скилл/флоу подходит.",
	},
	{
		name: "codebase-design",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/codebase-design",
		description:
			"Общий словарь проектирования глубоких модулей: интерфейсы, seams, тестируемость.",
	},
	{
		name: "diagnosing-bugs",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/diagnosing-bugs",
		description:
			"Цикл диагностики сложных багов и регрессий производительности.",
	},
	{
		name: "domain-modeling",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/domain-modeling",
		description: "Моделирование предметной области и единого языка домена.",
	},
	{
		name: "implement",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/implement",
		description: "Реализация задачи по PRD или набору issues.",
	},
	{
		name: "improve-codebase-architecture",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/improve-codebase-architecture",
		description:
			"Скан кодовой базы на возможности углубления модулей с HTML-отчётом и проработкой.",
	},
	{
		name: "prototype",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/prototype",
		description:
			"Одноразовый прототип для проработки дизайна (terminal-app или UI-варианты).",
	},
	{
		name: "resolving-merge-conflicts",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/resolving-merge-conflicts",
		description: "Разрешение текущих конфликтов merge/rebase в git.",
	},
	{
		name: "setup-matt-pocock-skills",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/setup-matt-pocock-skills",
		description:
			"Первичная настройка репо под инженерные скиллы: трекер, метки triage, доки.",
	},
	{
		name: "to-issues",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/to-issues",
		description:
			"Разбивка плана/PRD на независимые issues вертикальными tracer-slices.",
	},
	{
		name: "to-prd",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/to-prd",
		description: "Синтез текущего диалога в PRD и публикация в трекер.",
	},
	{
		name: "triage",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/engineering/triage",
		description: "Прогон issues и внешних PR через стейт-машину ролей triage.",
	},
	{
		name: "git-guardrails-claude-code",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/misc/git-guardrails-claude-code",
		description:
			"Хуки Claude Code, блокирующие опасные git-команды (push/reset/clean).",
	},
	{
		name: "migrate-to-shoehorn",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/misc/migrate-to-shoehorn",
		description: "Миграция тестов с `as` на @total-typescript/shoehorn.",
	},
	{
		name: "scaffold-exercises",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/misc/scaffold-exercises",
		description:
			"Скаффолдинг структуры упражнений (секции, задачи, решения, объяснения).",
	},
	{
		name: "setup-pre-commit",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/misc/setup-pre-commit",
		description:
			"Настройка Husky pre-commit с lint-staged, typecheck и тестами.",
	},
	{
		name: "edit-article",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/personal/edit-article",
		description:
			"Редактирование статей: реструктуризация, ясность, уплотнение прозы.",
	},
	{
		name: "obsidian-vault",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/personal/obsidian-vault",
		description:
			"Поиск, создание и организация заметок в Obsidian с wikilinks.",
	},
	{
		name: "grilling",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/productivity/grilling",
		description: "Релевантный stress-test плана через настойчивое интервью.",
	},
	{
		name: "handoff",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/productivity/handoff",
		description: "Компактизация диалога в handoff-документ для другого агента.",
	},
	{
		name: "teach",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/productivity/teach",
		description:
			"Обучение пользователя новому навыку/концепту в рамках воркспейса.",
	},
	{
		name: "writing-great-skills",
		repo: "github.com/mattpocock/skills",
		subpath: "skills/productivity/writing-great-skills",
		description:
			"Референс по написанию качественных скиллов: словарь и принципы.",
	},
	{
		name: "api-and-interface-design",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/api-and-interface-design",
		description:
			"Проектирование стабильных API, границ модулей и публичных интерфейсов (REST/GraphQL, контракты типов).",
	},
	{
		name: "browser-testing-with-devtools",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/browser-testing-with-devtools",
		description: "Тестирование в браузере через DevTools.",
	},
	{
		name: "ci-cd-and-automation",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/ci-cd-and-automation",
		description: "Настройка CI/CD и автоматизации пайплайнов.",
	},
	{
		name: "code-review-and-quality",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/code-review-and-quality",
		description: "Код-ревью и контроль качества кода.",
	},
	{
		name: "code-simplification",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/code-simplification",
		description: "Упрощение и рефакторинг кода без потери поведения.",
	},
	{
		name: "context-engineering",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/context-engineering",
		description: "Оптимизация контекста агента, rules-файлов и старта сессии.",
	},
	{
		name: "debugging-and-error-recovery",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/debugging-and-error-recovery",
		description: "Систематическая отладка и восстановление после ошибок.",
	},
	{
		name: "deprecation-and-migration",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/deprecation-and-migration",
		description: "Депрекация API и миграции между версиями.",
	},
	{
		name: "documentation-and-adrs",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/documentation-and-adrs",
		description: "Документация и архитектурные решения (ADR).",
	},
	{
		name: "doubt-driven-development",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/doubt-driven-development",
		description:
			"Адверсариальная проверка каждого нетривиального решения в свежем контексте.",
	},
	{
		name: "frontend-ui-engineering",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/frontend-ui-engineering",
		description: "Фронтенд UI-инженерия.",
	},
	{
		name: "git-workflow-and-versioning",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/git-workflow-and-versioning",
		description: "Git-воркфлоу и версионирование.",
	},
	{
		name: "idea-refine",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/idea-refine",
		description:
			"Превращение сырых идей в чёткие концепты через дивергентно-конвергентное мышление.",
	},
	{
		name: "incremental-implementation",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/incremental-implementation",
		description: "Инкрементальная реализация малыми проверяемыми шагами.",
	},
	{
		name: "interview-me",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/interview-me",
		description:
			"Извлечение истинного намерения пользователя через интервью по одному вопросу.",
	},
	{
		name: "observability-and-instrumentation",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/observability-and-instrumentation",
		description: "Observability и инструментирование кода.",
	},
	{
		name: "performance-optimization",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/performance-optimization",
		description: "Оптимизация производительности.",
	},
	{
		name: "planning-and-task-breakdown",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/planning-and-task-breakdown",
		description: "Планирование и декомпозиция задач.",
	},
	{
		name: "security-and-hardening",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/security-and-hardening",
		description: "Безопасность и hardening кода.",
	},
	{
		name: "shipping-and-launch",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/shipping-and-launch",
		description: "Выпуск и запуск продукта.",
	},
	{
		name: "source-driven-development",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/source-driven-development",
		description:
			"Привязка реализации к официальной документации с цитированием источников.",
	},
	{
		name: "spec-driven-development",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/spec-driven-development",
		description: "Разработка от спецификации.",
	},
	{
		name: "using-agent-skills",
		repo: "github.com/addyosmani/agent-skills",
		subpath: "skills/using-agent-skills",
		description: "Мета-навык: как использовать сами agent-skills.",
	},
	{
		name: "beautiful-article",
		repo: "github.com/ConardLi/garden-skills",
		subpath: "skills/beautiful-article",
		description:
			"Превращает URL/PDF/DOCX/Markdown/текст в красивую самодостаточную одностраничную HTML-статью.",
	},
	{
		name: "gpt-image-2",
		repo: "github.com/ConardLi/garden-skills",
		subpath: "skills/gpt-image-2",
		description:
			"Генерация/редактирование изображений через GPT Image 2; 80+ шаблонов в 3 режимах работы.",
	},
	{
		name: "kb-retriever",
		repo: "github.com/ConardLi/garden-skills",
		subpath: "skills/kb-retriever",
		description:
			"Поиск и Q&A по локальной базе знаний с послойной индексацией и обработкой PDF/Excel.",
	},
	{
		name: "web-design-engineer",
		repo: "github.com/ConardLi/garden-skills",
		subpath: "skills/web-design-engineer",
		description: "Скилл веб-дизайна и фронтенд-инженерии (китайский исходник).",
	},
	{
		name: "web-video-presentation",
		repo: "github.com/ConardLi/garden-skills",
		subpath: "skills/web-video-presentation",
		description:
			"Делает из статьи/сценария click-driven 16:9 веб-презентацию, похожую на видео, с опциональной озвучкой.",
	},
	{
		name: "reverse-engineering",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/reverse-engineering",
		description:
			"Базовые техники реверс-инжиниринга бинарей, APK, WASM, прошивок, VM и обфускации.",
	},
	{
		name: "api-security",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/api-security",
		description: "Анализ и тестирование безопасности API.",
	},
	{
		name: "apk-reverse",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/apk-reverse",
		description:
			"Реверс Android APK в CLI: распаковка, jadx, apktool, smali, Frida.",
	},
	{
		name: "attack-chain",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/attack-chain",
		description: "Построение цепочек атак из отдельных уязвимостей.",
	},
	{
		name: "binary-diff",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/binary-diff",
		description: "Сравнение бинарных версий для поиска изменений и патчей.",
	},
	{
		name: "browser-automation",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/browser-automation",
		description: "Автоматизация браузера для разведки и сбора доказательств.",
	},
	{
		name: "diagram-generator",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/diagram-generator",
		description:
			"Генерация диаграмм (Mermaid/Graphviz/PlantUML/SVG) из текста и кода.",
	},
	{
		name: "docs-generator",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/docs-generator",
		description: "Генерация документации по результатам анализа.",
	},
	{
		name: "edr-bypass-re",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/edr-bypass-re",
		description: "Реверс и обход EDR-защит.",
	},
	{
		name: "firmware-pentest",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/firmware-pentest",
		description: "Пентест и анализ прошивок устройств.",
	},
	{
		name: "ida-reverse",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/ida-reverse",
		description: "Реверс через IDA.",
	},
	{
		name: "js-reverse",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/js-reverse",
		description:
			"Реверс фронтенд-JS: поиск сигнатур, runtime-сэмплинг, восстановление окружения через js-reverse-mcp.",
	},
	{
		name: "llm-security",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/llm-security",
		description: "Безопасность LLM: prompt-injection и связанные атаки.",
	},
	{
		name: "malware-analysis",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/malware-analysis",
		description:
			"Анализ вредоносного ПО, детект инъекций (CreateRemoteThread и т.п.).",
	},
	{
		name: "mobile-reverse",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/mobile-reverse",
		description: "Реверс мобильных приложений (Android/iOS).",
	},
	{
		name: "patch-diff-exploit",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/patch-diff-exploit",
		description: "Поиск уязвимостей через diff патчей и построение эксплойта.",
	},
	{
		name: "pentest-tools",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/pentest-tools",
		description: "Набор инструментов для пентеста (вкл. src-hunter).",
	},
	{
		name: "pwn-chain",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/pwn-chain",
		description: "Построение pwn-эксплойт-цепочек.",
	},
	{
		name: "radare2",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/radare2",
		description: "Реверс через radare2.",
	},
	{
		name: "supply-chain-security",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "skills/supply-chain-security",
		description: "Безопасность цепочки поставок ПО.",
	},
	{
		name: "ctf-sandbox-orchestrator",
		repo: "github.com/zhaoxuya520/reverse-skill",
		subpath: "CTF-Sandbox-Orchestrator/ctf-sandbox-orchestrator",
		description:
			"Оркестратор CTF-песочницы, маршрутизирующий 40 специализированных competition-навыков.",
	},
	{
		name: "last30days",
		repo: "github.com/mvanhorn/last30days-skill",
		subpath: "skills/last30days",
		description:
			"Собирает посты и вовлечённость по теме за 30 дней (Reddit, X, YouTube, TikTok, HN, Polymarket, GitHub, веб) и синтезирует сводку.",
	},
	{
		name: "intended-vs-implemented",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-ai-shipping/skills/intended-vs-implemented",
		description: "Сверка задуманного и реализованного в продукте.",
	},
	{
		name: "shipping-artifacts",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-ai-shipping/skills/shipping-artifacts",
		description: "Артефакты для выпуска фич.",
	},
	{
		name: "ab-test-analysis",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-data-analytics/skills/ab-test-analysis",
		description: "Анализ результатов A/B-тестов.",
	},
	{
		name: "cohort-analysis",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-data-analytics/skills/cohort-analysis",
		description: "Когортный анализ пользователей.",
	},
	{
		name: "sql-queries",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-data-analytics/skills/sql-queries",
		description: "Генерация SQL-запросов для аналитики.",
	},
	{
		name: "brainstorm-okrs",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/brainstorm-okrs",
		description: "Брейнсторм OKR-целей.",
	},
	{
		name: "create-prd",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/create-prd",
		description: "Создание PRD по 8-секционному шаблону.",
	},
	{
		name: "dummy-dataset",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/dummy-dataset",
		description: "Генерация тестового датасета.",
	},
	{
		name: "job-stories",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/job-stories",
		description: "Формулировка job stories (JTBD).",
	},
	{
		name: "outcome-roadmap",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/outcome-roadmap",
		description: "Дорожная карта по результатам.",
	},
	{
		name: "pre-mortem",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/pre-mortem",
		description: "Pre-mortem анализ рисков.",
	},
	{
		name: "prioritization-frameworks",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/prioritization-frameworks",
		description: "Фреймворки приоритизации.",
	},
	{
		name: "release-notes",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/release-notes",
		description: "Подготовка release notes.",
	},
	{
		name: "sprint-plan",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/sprint-plan",
		description: "Планирование спринта.",
	},
	{
		name: "stakeholder-map",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/stakeholder-map",
		description: "Карта стейкхолдеров.",
	},
	{
		name: "strategy-red-team",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/strategy-red-team",
		description: "Red-team проверка стратегии.",
	},
	{
		name: "summarize-meeting",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/summarize-meeting",
		description: "Резюме встречи.",
	},
	{
		name: "test-scenarios",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/test-scenarios",
		description: "Генерация тест-сценариев.",
	},
	{
		name: "user-stories",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/user-stories",
		description: "Написание user stories.",
	},
	{
		name: "wwas",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-execution/skills/wwas",
		description: "Working backwards / WWAS-нарратив.",
	},
	{
		name: "beachhead-segment",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-go-to-market/skills/beachhead-segment",
		description: "Выбор плацдарм-сегмента.",
	},
	{
		name: "competitive-battlecard",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-go-to-market/skills/competitive-battlecard",
		description: "Конкурентные battlecards.",
	},
	{
		name: "growth-loops",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-go-to-market/skills/growth-loops",
		description: "Проектирование циклов роста.",
	},
	{
		name: "gtm-motions",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-go-to-market/skills/gtm-motions",
		description: "GTM-движения и каналы продаж.",
	},
	{
		name: "gtm-strategy",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-go-to-market/skills/gtm-strategy",
		description: "Go-to-market стратегия запуска.",
	},
	{
		name: "ideal-customer-profile",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-go-to-market/skills/ideal-customer-profile",
		description: "Идеальный профиль клиента (ICP).",
	},
	{
		name: "competitor-analysis",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/competitor-analysis",
		description: "Анализ конкурентов и дифференциации.",
	},
	{
		name: "customer-journey-map",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/customer-journey-map",
		description: "Карта пути клиента.",
	},
	{
		name: "market-segments",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/market-segments",
		description: "Сегментация рынка.",
	},
	{
		name: "market-sizing",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/market-sizing",
		description: "Оценка объёма рынка (TAM/SAM/SOM).",
	},
	{
		name: "sentiment-analysis",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/sentiment-analysis",
		description: "Анализ тональности отзывов.",
	},
	{
		name: "user-personas",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/user-personas",
		description: "Создание пользовательских персон.",
	},
	{
		name: "user-segmentation",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-market-research/skills/user-segmentation",
		description: "Сегментация пользователей.",
	},
	{
		name: "marketing-ideas",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-marketing-growth/skills/marketing-ideas",
		description: "Идеи для маркетинга.",
	},
	{
		name: "north-star-metric",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-marketing-growth/skills/north-star-metric",
		description: "Определение North Star метрики.",
	},
	{
		name: "positioning-ideas",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-marketing-growth/skills/positioning-ideas",
		description: "Идеи позиционирования.",
	},
	{
		name: "product-name",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-marketing-growth/skills/product-name",
		description: "Нейминг продукта.",
	},
	{
		name: "value-prop-statements",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-marketing-growth/skills/value-prop-statements",
		description: "Формулировки ценностного предложения.",
	},
	{
		name: "analyze-feature-requests",
		repo: "github.com/phuryn/pm-skills",
		subpath: "pm-product-discovery/skills/analyze-feature-requests",
		description: "Анализ запросов на фичи.",
	},
	{
		name: "defuddle",
		repo: "github.com/kepano/obsidian-skills",
		subpath: "skills/defuddle",
		description:
			"Извлечение чистого markdown из веб-страниц через Defuddle CLI вместо WebFetch (экономия токенов).",
	},
	{
		name: "json-canvas",
		repo: "github.com/kepano/obsidian-skills",
		subpath: "skills/json-canvas",
		description:
			"Создание и редактирование файлов .canvas (узлы, рёбра, группы, связи) — карты, флоучарты.",
	},
	{
		name: "obsidian-bases",
		repo: "github.com/kepano/obsidian-skills",
		subpath: "skills/obsidian-bases",
		description:
			"Создание и редактирование .base файлов: представления, фильтры, формулы, сводки.",
	},
	{
		name: "obsidian-cli",
		repo: "github.com/kepano/obsidian-skills",
		subpath: "skills/obsidian-cli",
		description:
			"Работа с Obsidian-хранилищем через CLI: заметки, поиск, задачи плюс разработка/отладка плагинов.",
	},
	{
		name: "obsidian-markdown",
		repo: "github.com/kepano/obsidian-skills",
		subpath: "skills/obsidian-markdown",
		description:
			"Создание Obsidian Flavored Markdown: wikilinks, embeds, callouts, properties, теги.",
	},
	{
		name: "a11y-audit",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering-team/a11y-audit",
		description:
			"Аудит и фикс доступности WCAG 2.2 A/AA для React/Vue/Angular/Svelte/HTML.",
	},
	{
		name: "agent-workflow-designer",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/agent-workflow-designer",
		description:
			"Проектирование production multi-agent пайплайнов (sequential/parallel/hierarchical) с контрактами handoff.",
	},
	{
		name: "ai-security",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/ai-security",
		description:
			"Оценка AI/ML на prompt injection, jailbreak, data poisoning; маппинг MITRE ATLAS.",
	},
	{
		name: "api-design-reviewer",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/api-design-reviewer",
		description:
			"Ревью REST API: линтинг, детект breaking-change, скоркарты дизайна.",
	},
	{
		name: "aws-solution-architect",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/aws-solution-architect",
		description:
			"Дизайн serverless-архитектур AWS (Lambda, DynamoDB, ECS) + IaC и оптимизация костов.",
	},
	{
		name: "azure-cloud-architect",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/azure-cloud-architect",
		description:
			"Дизайн Azure-архитектур (AKS, Functions, Cosmos DB), Bicep/ARM, оптимизация костов.",
	},
	{
		name: "autoresearch-agent",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/autoresearch-agent",
		description:
			"Автономный цикл оптимизации файла по метрике (Karpathy autoresearch) с git-коммит/ресет.",
	},
	{
		name: "agenthub",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/agenthub",
		description:
			"Мульти-агент: N параллельных subagent-ов в git worktree конкурируют, лучший мержится.",
	},
	{
		name: "board-deck-builder",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/board-deck-builder",
		description: "Сборка борд/инвестор-деков с перспективами всего C-suite.",
	},
	{
		name: "karpathy-coder",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/karpathy-coder",
		description:
			"Энфорс 4 принципов кодинга Карпатого при write/review/commit.",
	},
	{
		name: "llm-wiki",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/llm-wiki",
		description:
			"Персистентная база знаний (second brain) в Obsidian под управлением LLM.",
	},
	{
		name: "write-a-skill",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/write-a-skill",
		description:
			"Создание новых agent skills с прогрессивным раскрытием и ресурсами.",
	},
	{
		// NOTE: `engineering-team/playwright-pro` is a bundle of 10 inner skills
		// with no top-level SKILL.md, so build-preinstall-catalog.ts fail-soft
		// skips it (285/286 staged). TODO: to reach the full 286, pin this
		// `subpath` to ONE concrete inner skill dir (e.g.
		// "engineering-team/playwright-pro/<chosen-skill>") — a one-line change
		// once we pick which of the 10 inner skills to ship.
		name: "playwright-pro",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering-team/playwright-pro",
		description: "Профессиональное E2E-тестирование на Playwright.",
	},
	{
		name: "security-guidance",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/security-guidance",
		description:
			"PreToolUse-хук, ловит 12 типов security-антипаттернов (injection, XSS и т.п.).",
	},
	{
		name: "code-tour",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/code-tour",
		description:
			"Генерация CodeTour .tour — персона-таргетированных пошаговых обходов кода.",
	},
	{
		name: "data-quality-auditor",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/data-quality-auditor",
		description:
			"Аудит датасетов: полнота, консистентность, аномалии, профилирование.",
	},
	{
		name: "terraform-patterns",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "engineering/terraform-patterns",
		description: "Terraform IaC-паттерны и плагин для нескольких агентов.",
	},
	{
		name: "adversarial-reviewer",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/adversarial-reviewer",
		description: "Состязательное ревью с поиском слабых мест и контрпримеров.",
	},
	{
		name: "agile-product-owner",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "product-team/agile-product-owner",
		description: "Роль agile product owner: бэклог, истории, приоритизация.",
	},
	{
		name: "apple-hig-expert",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "product-team/apple-hig-expert",
		description: "Эксперт по Apple Human Interface Guidelines.",
	},
	{
		name: "code-to-prd",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "product-team/code-to-prd",
		description: "Восстановление PRD из существующего кода.",
	},
	{
		name: "research-summarizer",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "product-team/research-summarizer",
		description: "Суммаризация исследовательских материалов.",
	},
	{
		name: "c-level-agents",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "c-level-advisor/c-level-agents/skills/c-level-agents",
		description: "Набор C-level агентов-ревьюеров (CTO/CFO/CMO/CISO и т.д.).",
	},
	{
		name: "executive-mentor",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "c-level-advisor/executive-mentor/skills/executive-mentor",
		description:
			"Ментор для руководителей: hard-call, stress-test, post-mortem.",
	},
	{
		name: "general-counsel-advisor",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath:
			"c-level-advisor/general-counsel-advisor/skills/general-counsel-advisor",
		description: "Советник уровня general counsel (юридические решения).",
	},
	{
		name: "chief-ai-officer-advisor",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath:
			"c-level-advisor/chief-ai-officer-advisor/skills/chief-ai-officer-advisor",
		description: "Советник уровня CAIO по AI-стратегии.",
	},
	{
		name: "business-growth-skills",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "business-growth/skills/business-growth-skills",
		description:
			"Пак скиллов роста бизнеса: продажи, revenue ops, customer success.",
	},
	{
		name: "revenue-operations",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "business-growth/skills/revenue-operations",
		description: "Revenue operations: воронка, метрики, процессы.",
	},
	{
		name: "business-operations-skills",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "business-operations/skills/business-operations-skills",
		description:
			"Операционный пак: capacity, vendor, procurement, process mapping.",
	},
	{
		name: "andreessen",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "productivity/andreessen",
		description: "Продуктивность в стиле Andreessen (фокус, заметки).",
	},
	{
		name: "litreview",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "research/litreview",
		description: "Систематический обзор литературы.",
	},
	{
		name: "patent",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "research/patent",
		description: "Помощь с патентным поиском/анализом.",
	},
	{
		name: "dossier",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "research/dossier",
		description: "Сбор досье по теме/субъекту.",
	},
	{
		name: "landing",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "marketing/landing",
		description: "Генерация и оптимизация лендингов.",
	},
	{
		name: "app-store-optimization",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/app-store-optimization",
		description: "ASO: оптимизация листингов App Store/Play.",
	},
	{
		name: "ab-test-setup",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: ".gemini/skills/ab-test-setup",
		description: "Настройка A/B тестов и измерение результатов.",
	},
	{
		name: "compliance-team-eu-ai-act",
		repo: "github.com/alirezarezvani/claude-skills",
		subpath: "ra-qm-team/compliance-team-eu-ai-act",
		description: "Команда комплаенса под EU AI Act.",
	},
	{
		name: "ui-ux-pro-max",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/ui-ux-pro-max",
		description:
			"Ядро UI/UX-интеллекта (50+ стилей, 161 палитра, 57 пар шрифтов, UX-гайдлайны, 25 типов графиков) для 10 стеков web/mobile.",
	},
	{
		name: "design",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/design",
		description:
			"Комплексный дизайн: логотипы, фирстиль (CIP), токены, баннеры, иконки, соц-картинки, HTML-презентации.",
	},
	{
		name: "design-system",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/design-system",
		description:
			"Архитектура токенов (primitive→semantic→component), CSS-переменные, спеки компонентов, генерация слайдов.",
	},
	{
		name: "ui-styling",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/ui-styling",
		description:
			"Доступные интерфейсы на shadcn/ui + Radix + Tailwind: компоненты, темы, dark mode, респонсив.",
	},
	{
		name: "brand",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/brand",
		description:
			"Бренд: tone of voice, визуальная идентичность, мессенджинг, style guides, бренд-консистентность.",
	},
	{
		name: "banner-design",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/banner-design",
		description:
			"Баннеры для соцсетей, рекламы, web-героев и печати с AI-визуалами и множеством арт-направлений.",
	},
	{
		name: "slides",
		repo: "github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		subpath: ".claude/skills/slides",
		description:
			"Стратегические HTML-презентации с Chart.js, дизайн-токенами и адаптивными лейаутами.",
	},
] as const;
