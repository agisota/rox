import { COMPANY } from "@rox/shared/constants";
import { getBlogPosts } from "@/lib/blog";
import { getComparisonPages } from "@/lib/compare";
import { FAQ_ITEMS } from "../components/FAQSection/constants";

function stripMdxSyntax(content: string): string {
	return (
		content
			// Remove import statements
			.replace(/^import\s+.*$/gm, "")
			// Remove JSX component tags (e.g. <Video ... />, <Component>...</Component>)
			.replace(/<[A-Z]\w*\b[^>]*\/>/g, "")
			.replace(/<[A-Z]\w*\b[^>]*>[\s\S]*?<\/[A-Z]\w*>/g, "")
			// Clean up excessive blank lines
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

export async function GET() {
	const posts = getBlogPosts();
	const comparisons = getComparisonPages();
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const sections: string[] = [];

	// Header section (same as llms.txt)
	sections.push(
		[
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
		].join("\n"),
	);

	// Comparison pages - full content
	if (comparisons.length > 0) {
		sections.push(
			[
				"---",
				"",
				"# Сравнения",
				"",
				...comparisons.flatMap((page) => [
					`## ${page.title}`,
					"",
					`URL: ${baseUrl}/compare/${page.slug}`,
					"",
					stripMdxSyntax(page.content),
					"",
				]),
			].join("\n"),
		);
	}

	// Blog posts - full content
	if (posts.length > 0) {
		sections.push(
			[
				"---",
				"",
				"# Посты блога",
				"",
				...posts.flatMap((post) => [
					`## ${post.title}`,
					"",
					`URL: ${baseUrl}/blog/${post.slug}`,
					`Date: ${post.date}`,
					`Author: ${post.author.name}`,
					"",
					stripMdxSyntax(post.content),
					"",
				]),
			].join("\n"),
		);
	}

	// FAQ section
	sections.push(
		[
			"---",
			"",
			"# FAQ",
			"",
			...FAQ_ITEMS.flatMap((item) => [
				`## ${item.question}`,
				"",
				item.answer,
				"",
			]),
		].join("\n"),
	);

	const content = sections.join("\n\n");

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
