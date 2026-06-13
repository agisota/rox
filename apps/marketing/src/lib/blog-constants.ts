export const BLOG_CATEGORIES = [
	"Все посты",
	"Продукт",
	"Инженерия",
	"Исследования",
	"Компания",
	"Новости",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
