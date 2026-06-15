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
];

export const TOP_LEVEL_LINKS: NavLink[] = [];
