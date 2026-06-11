import { COMPANY } from "@rox/shared/constants";

export interface NavLink {
	href: string;
	label: string;
	description?: string;
	external?: boolean;
}

export const PRODUCT_LINKS: NavLink[] = [
	{
		href: "/",
		label: "Обзор",
		description: "Терминал для coding agents.",
	},
	{
		href: "/changelog",
		label: "Журнал изменений",
		description: "Новые релизы и обновления продукта.",
	},
];

export const RESOURCE_LINKS: NavLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: "Документация",
		description: "Руководства, справочники и интеграции.",
		external: true,
	},
	{
		href: "/blog",
		label: "Блог",
		description: "Технические разборы и запуски.",
	},
	{
		href: "/community",
		label: "Сообщество",
		description: "Discord, GitHub и открытые встречи.",
	},
	{
		href: "/team",
		label: "О нас",
		description: "Команда, которая делает Rox.",
	},
];

export const TOP_LEVEL_LINKS: NavLink[] = [
	{ href: "/pricing", label: "Цены" },
	{ href: "/enterprise", label: "Для бизнеса" },
];
