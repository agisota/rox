import { COMPANY } from "@superset/shared/constants";

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
		description: "Рабочая станция для агентов разработки.",
	},
	{
		href: "/changelog",
		label: "Изменения",
		description: "Новые версии и обновления продукта.",
	},
];

export const RESOURCE_LINKS: NavLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: "Документация",
		description: "Руководства, справка и интеграции.",
		external: true,
	},
	{
		href: "/blog",
		label: "Блог",
		description: "Разборы архитектуры и новые запуски.",
	},
	{
		href: "/community",
		label: "Сообщество",
		description: "Обсуждения, код и встречи.",
	},
	{
		href: "/team",
		label: "О продукте",
		description: `Команда ${COMPANY.NAME}.`,
	},
];

export const TOP_LEVEL_LINKS: NavLink[] = [
	{ href: "/pricing", label: "Тарифы" },
	{ href: "/enterprise", label: "Для компаний" },
];
