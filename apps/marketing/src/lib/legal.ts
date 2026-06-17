import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const LEGAL_DIR = path.join(process.cwd(), "content/legal");

export interface LegalPage {
	slug: string;
	title: string;
	description: string;
	lastUpdated: string;
	content: string;
}

export interface LegalDocumentEntry {
	slug: string;
	title: string;
	description: string;
	/** Shown as a full section on the /legal hub page. */
	hubInline?: boolean;
	order: number;
}

export const LEGAL_DOCUMENTS: LegalDocumentEntry[] = [
	{
		slug: "offer",
		title: "Публичная оферта",
		description: "Условия предоставления платных и бесплатных сервисов Rox.",
		order: 1,
	},
	{
		slug: "terms",
		title: "Пользовательское соглашение",
		description: "Правила использования сайта и приложения Rox.",
		order: 2,
		hubInline: true,
	},
	{
		slug: "privacy",
		title: "Политика конфиденциальности",
		description: "Как мы собираем, используем и защищаем персональные данные.",
		order: 3,
		hubInline: true,
	},
	{
		slug: "security",
		title: "Безопасность",
		description: "Принципы и меры защиты данных и инфраструктуры Rox.",
		order: 4,
		hubInline: true,
	},
	{
		slug: "cookies",
		title: "Политика cookies",
		description: "Какие cookie используются на сайте и как ими управлять.",
		order: 5,
	},
	{
		slug: "personal-data",
		title: "Согласие на обработку персональных данных",
		description: "Форма и условия согласия на обработку ПДн.",
		order: 6,
	},
	{
		slug: "subprocessors",
		title: "Субпроцессоры",
		description: "Сторонние сервисы, обрабатывающие данные от нашего имени.",
		order: 7,
	},
];

export function getLegalPage(slug: string): LegalPage | null {
	const filePath = path.join(LEGAL_DIR, `${slug}.mdx`);

	if (!fs.existsSync(filePath)) {
		return null;
	}

	const fileContent = fs.readFileSync(filePath, "utf-8");
	const { data, content } = matter(fileContent);

	return {
		slug,
		title: data.title ?? "Untitled",
		description: data.description ?? "",
		lastUpdated: data.lastUpdated ?? "",
		content,
	};
}

export function getLegalHubPages(): LegalPage[] {
	return LEGAL_DOCUMENTS.map((entry) => getLegalPage(entry.slug)).filter(
		(page): page is LegalPage => page !== null,
	);
}

export function getAllLegalSlugs(): string[] {
	if (!fs.existsSync(LEGAL_DIR)) {
		return [];
	}

	return fs
		.readdirSync(LEGAL_DIR)
		.filter((f) => f.endsWith(".mdx"))
		.map((f) => path.basename(f, ".mdx"));
}
