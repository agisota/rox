/**
 * Static content for the in-app "Начало работы" / "Справочник по CLI" page.
 *
 * Pure data so the page component stays declarative and the catalog is easy to
 * extend. All copy is RU to match the rest of the desktop UI.
 */

import { CURATED_DEFAULT_SKILL_PACKS } from "@rox/shared/skills/curated-default-skills";

export interface SlashCommand {
	/** The slash command as typed in the agent chat, e.g. "/autopilot". */
	command: string;
	/** One-line RU description of what it does. */
	description: string;
	/** A concrete example invocation. */
	example: string;
}

/**
 * Agent chat slash-commands worth surfacing to new users. These run inside an
 * agent conversation (the chat pane), not in the shell.
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
	{
		command: "/open-dynamic-workflows",
		description:
			"Открывает динамические рабочие процессы: агент сам разбивает задачу на шаги и ведёт её по этапам.",
		example: "/open-dynamic-workflows подготовить релиз 2.1 и прогнать тесты",
	},
	{
		command: "/brainstorming",
		description:
			"Режим брейншторма: агент предлагает варианты, взвешивает компромиссы и помогает выбрать направление до начала кода.",
		example: "/brainstorming как организовать кэш для офлайн-режима",
	},
	{
		command: "/autopilot",
		description:
			"Автопилот: агент планирует, исполняет и проверяет задачу целиком, без пошагового подтверждения.",
		example: "/autopilot добавь тёмную тему и доведи до зелёного билда",
	},
	{
		command: "/team",
		description:
			"Запускает команду агентов параллельно: декомпозиция на подзадачи с границами файлов и синтез результатов.",
		example: "/team 3:executor «реализуй экран настроек по макету»",
	},
];

export interface CliCommand {
	/** The shell invocation, e.g. "rox workspaces create". */
	command: string;
	/** One-line RU description. */
	description: string;
}

export interface CliCommandGroup {
	id: string;
	label: string;
	commands: readonly CliCommand[];
}

/**
 * Core `rox` CLI commands grouped by area. The CLI ships bundled with the app
 * (a `rox` shim is installed into every Rox terminal's PATH on launch), so
 * these run out-of-the-box.
 */
export const CLI_COMMAND_GROUPS: readonly CliCommandGroup[] = [
	{
		id: "getting-started",
		label: "Начало работы",
		commands: [
			{ command: "rox --help", description: "Список всех команд и флагов." },
			{
				command: "rox auth login",
				description: "Войти в свой аккаунт Rox из терминала.",
			},
			{
				command: "rox status",
				description: "Показать статус локального хост-сервиса и сессии.",
			},
		],
	},
	{
		id: "workspaces",
		label: "Рабочие пространства",
		commands: [
			{
				command: "rox workspaces create",
				description: "Создать новое рабочее пространство (git-воркт­ри).",
			},
			{
				command: "rox workspaces list",
				description: "Список рабочих пространств.",
			},
			{
				command: "rox workspaces open <id>",
				description: "Открыть рабочее пространство.",
			},
			{
				command: "rox workspaces delete <id>",
				description: "Удалить рабочее пространство.",
			},
		],
	},
	{
		id: "tasks",
		label: "Задачи",
		commands: [
			{
				command: "rox tasks list",
				description: "Список задач в текущем проекте.",
			},
			{
				command: "rox tasks create",
				description: "Создать задачу и запустить агента над ней.",
			},
		],
	},
	{
		id: "automations",
		label: "Автоматизации",
		commands: [
			{
				command: "rox automations list",
				description: "Список настроенных автоматизаций.",
			},
			{
				command: "rox automations run <id>",
				description: "Запустить автоматизацию вручную сейчас.",
			},
		],
	},
];

export interface PreinstalledMcpServer {
	name: string;
	description: string;
	/** "Готово" when no key is needed, otherwise the required env var. */
	requires?: string;
}

/**
 * The MCP servers seeded into every new workspace (mirrors
 * `DEFAULT_MCP_SERVERS` in the host-service). Shown so users know what's
 * available out-of-the-box on the MCP tab.
 */
export const PREINSTALLED_MCP_SERVERS: readonly PreinstalledMcpServer[] = [
	{
		name: "filesystem",
		description: "Чтение и запись файлов в пределах рабочего пространства.",
	},
	{
		name: "sequential-thinking",
		description: "Помощник пошагового рассуждения для сложных задач.",
	},
	{
		name: "exa",
		description: "Поиск по вебу и коду.",
		requires: "EXA_API_KEY",
	},
	{
		name: "context7",
		description: "Актуальная документация библиотек и фреймворков.",
	},
	{
		name: "rox",
		description: "Хостируемый Rox MCP (api.zed.md) — удалённый HTTP-эндпоинт.",
	},
	{
		name: "telegram",
		description: "Мост в Telegram для уведомлений и сообщений.",
		requires: "TELEGRAM_BOT_TOKEN",
	},
];

export interface PreinstalledSkill {
	/** Display slug. */
	name: string;
	/** Source GitHub repo. */
	repo: string;
	description: string;
}

/**
 * Skills preinstalled into the user's global Claude catalog so they appear on
 * the Навыки tab. Derived from the single shared multiplatform source of truth
 * ({@link CURATED_DEFAULT_SKILL_PACKS}) — one source of truth, no duplicated
 * literals. The actual skill files are installed by the bundled catalog.
 */
export const PREINSTALLED_SKILLS: readonly PreinstalledSkill[] =
	CURATED_DEFAULT_SKILL_PACKS.map((pack) => ({
		name: pack.name,
		repo: pack.repo,
		description: pack.description,
	}));
