import { COMPANY } from "@rox/shared/constants";
import { getBlogPosts } from "@/lib/blog";
import { getComparisonPages } from "@/lib/compare";
import { FAQ_ITEMS } from "../components/FAQSection/constants";

export async function GET() {
	const posts = getBlogPosts();
	const comparisons = getComparisonPages();
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const lines: string[] = [
		`# ${COMPANY.NAME}`,
		"",
		"> Запускай 10+ кодинг-агентов параллельно на своей машине",
		"",
		`${COMPANY.NAME} — desktop-приложение с открытым исходным кодом, которое помогает разработчикам запускать несколько ИИ-кодинг-агентов параллельно: каждый работает в своём изолированном Git worktree. Rox работает с CLI-агентами, включая Claude Code, OpenCode и OpenAI Codex. Агенты могут параллельно работать над разными ветками или фичами без конфликтов. ${COMPANY.NAME} бесплатен, не проксирует API-вызовы и поддерживает macOS; версии для Windows и Linux появятся позже.`,
		"",
		"## Документация",
		"",
		`- [Документация](${docsUrl})`,
		`- [Быстрый старт](${docsUrl}/getting-started)`,
		`- [GitHub](${COMPANY.GITHUB_URL})`,
		"",
		"## Блог",
		"",
		...posts.map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug})`),
		"",
		"## Сравнения",
		"",
		...comparisons.map(
			(page) => `- [${page.title}](${baseUrl}/compare/${page.slug})`,
		),
		"",
		"## FAQ",
		"",
		...FAQ_ITEMS.flatMap((item) => [
			`### ${item.question}`,
			"",
			item.answer,
			"",
		]),
	];

	const content = lines.join("\n");

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
