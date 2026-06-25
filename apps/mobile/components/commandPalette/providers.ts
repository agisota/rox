import type { CommandProvider } from "@rox/shared/command-palette";
import type { MobileCommandContext } from "./context";

/**
 * Navigation + action providers for the mobile palette — the RN mirror of the
 * web/desktop providers, running through the identical shared registry/matcher/
 * execute core. DOM-free: `run` uses expo-router navigation only.
 */
export const mobileNavigationProvider: CommandProvider<MobileCommandContext> = {
	id: "mobile.navigation",
	provide: () => [
		{
			id: "nav.home",
			title: "Главная",
			section: "navigation",
			keywords: ["home", "главная", "дом"],
			run: (ctx) => ctx.navigate("/(authenticated)/(home)"),
		},
		{
			id: "nav.tasks",
			title: "Задачи",
			section: "navigation",
			keywords: ["tasks", "задачи"],
			run: (ctx) => ctx.navigate("/(authenticated)/(tasks)"),
		},
		{
			id: "nav.more",
			title: "Ещё",
			section: "navigation",
			keywords: ["more", "ещё", "меню"],
			run: (ctx) => ctx.navigate("/(authenticated)/(more)"),
		},
		{
			id: "nav.settings",
			title: "Настройки",
			section: "navigation",
			keywords: ["settings", "настройки"],
			run: (ctx) => ctx.navigate("/(authenticated)/(more)/settings"),
		},
	],
};

export const mobileActionsProvider: CommandProvider<MobileCommandContext> = {
	id: "mobile.actions",
	provide: () => [
		{
			id: "nav.chat",
			title: "Чаты",
			section: "actions",
			keywords: ["chat", "чаты", "сообщения"],
			run: (ctx) => ctx.navigate("/(authenticated)/(more)/chat"),
		},
	],
};

export const mobileCommandProviders: CommandProvider<MobileCommandContext>[] = [
	mobileActionsProvider,
	mobileNavigationProvider,
];
