import type { Command, CommandProvider } from "@rox/shared/command-palette";
import type { WebCommandContext } from "./context";

type WebCommand = Command<WebCommandContext>;

/**
 * Navigation commands — the web mirror of the desktop navigation provider. Each
 * entry navigates via the injected Next router and is discoverable under the
 * `>` command scope (no explicit `scope`, so it is the default).
 */
export const webNavigationProvider: CommandProvider<WebCommandContext> = {
	id: "web.navigation",
	provide: () => {
		const commands: WebCommand[] = [
			{
				id: "nav.home",
				title: "Главная",
				section: "navigation",
				keywords: ["home", "dashboard", "главная"],
				run: (ctx) => ctx.navigate("/"),
			},
			{
				id: "nav.integrations",
				title: "Интеграции",
				section: "navigation",
				keywords: ["integrations", "интеграции", "linear", "github"],
				run: (ctx) => ctx.navigate("/integrations"),
			},
			{
				id: "nav.workspaces",
				title: "Рабочие области",
				section: "navigation",
				keywords: ["workspaces", "рабочие области", "проекты"],
				run: (ctx) => ctx.navigate("/workspaces"),
			},
			{
				id: "nav.notes",
				title: "Заметки",
				section: "navigation",
				keywords: ["notes", "заметки"],
				run: (ctx) => ctx.navigate("/notes"),
			},
			{
				id: "nav.docs",
				title: "Открыть документацию",
				section: "navigation",
				keywords: ["docs", "документация", "help"],
				run: () => {
					window.open("https://docs.rox.one", "_blank", "noreferrer");
				},
			},
		];
		return commands;
	},
};

/**
 * Action commands — global actions available everywhere on web.
 */
export const webActionsProvider: CommandProvider<WebCommandContext> = {
	id: "web.actions",
	provide: () => {
		const commands: WebCommand[] = [
			{
				id: "action.copyLink",
				title: "Скопировать ссылку на страницу",
				section: "actions",
				keywords: ["copy", "link", "ссылка", "url"],
				run: async (ctx) => {
					await navigator.clipboard.writeText(
						`${window.location.origin}${ctx.pathname}`,
					);
				},
			},
		];
		return commands;
	},
};

export const webCommandProviders: CommandProvider<WebCommandContext>[] = [
	webActionsProvider,
	webNavigationProvider,
];
