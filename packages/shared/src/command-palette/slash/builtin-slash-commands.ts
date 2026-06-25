/**
 * Locale-aware built-in slash commands (F45).
 *
 * These mirror the desktop engine's built-ins
 * (`@rox/chat/.../slash-commands/builtins.ts`) but carry locale-aware
 * descriptions so the web and mobile menus — which have no access to the
 * desktop chat service — can list the same first-party commands the desktop
 * shows. Custom (filesystem) commands remain desktop-only; this is the shared
 * floor every host can render.
 */

import type { SlashMenuEntry } from "./slash-command-source";

/** The shared built-in commands, with `en`/`ru` descriptions. */
const BUILTIN_SLASH_COMMANDS: readonly SlashMenuEntry[] = [
	{
		name: "new",
		aliases: ["clear"],
		description: {
			en: "Start a fresh chat session.",
			ru: "Начать новую сессию чата.",
		},
		argumentHint: "",
		source: "builtin",
	},
	{
		name: "stop",
		aliases: [],
		description: {
			en: "Stop the currently running response.",
			ru: "Остановить текущий ответ.",
		},
		argumentHint: "",
		source: "builtin",
	},
	{
		name: "model",
		aliases: [],
		description: {
			en: "Switch the active model, or open the model picker.",
			ru: "Сменить активную модель или открыть выбор модели.",
		},
		argumentHint: "[<model-id-or-name>]",
		source: "sub-arg",
	},
	{
		name: "theme",
		aliases: [],
		description: {
			en: "Switch the app theme, with live preview.",
			ru: "Сменить тему приложения с живым предпросмотром.",
		},
		argumentHint: "[<theme>]",
		source: "sub-arg",
	},
	{
		name: "review",
		aliases: [],
		description: {
			en: "Review code for bugs, regressions, and missing tests.",
			ru: "Проверить код на ошибки, регрессии и нехватку тестов.",
		},
		argumentHint: "[<scope>]",
		source: "builtin",
	},
	{
		name: "plan",
		aliases: [],
		description: {
			en: "Draft an implementation plan before coding.",
			ru: "Составить план реализации перед написанием кода.",
		},
		argumentHint: "[<goal>]",
		source: "builtin",
	},
	{
		name: "test",
		aliases: [],
		description: {
			en: "Design tests and edge cases for a target.",
			ru: "Спроектировать тесты и граничные случаи для цели.",
		},
		argumentHint: "[<target>]",
		source: "builtin",
	},
	{
		name: "refactor",
		aliases: [],
		description: {
			en: "Propose a refactor with constraints and safeguards.",
			ru: "Предложить рефакторинг с ограничениями и подстраховкой.",
		},
		argumentHint: "[<scope>]",
		source: "builtin",
	},
];

/**
 * Return a fresh copy of the shared built-in slash commands. Callers may merge
 * these with host-specific (e.g. desktop filesystem) commands before matching.
 */
export function getBuiltinSlashMenuEntries(): SlashMenuEntry[] {
	return BUILTIN_SLASH_COMMANDS.map((command) => ({
		...command,
		aliases: [...command.aliases],
	}));
}
