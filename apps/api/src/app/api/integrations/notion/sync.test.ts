import { describe, expect, test } from "bun:test";
import type { NotionSearchResult } from "./notion-client";
import {
	buildSlug,
	extractTitle,
	mapNotionPages,
	mapNotionPageToKnowledgeDoc,
	type NotionMapContext,
	renderNotionBlocksToMarkdown,
} from "./sync";

const ctx: NotionMapContext = {
	organizationId: "org-1",
	importBatchId: "batch-1",
};

/** Builds a Notion page with a title-type property named `Name`. */
function pageWithTitle(
	id: string,
	title: string | null,
	extra: Partial<NotionSearchResult> = {},
): NotionSearchResult {
	const properties: Record<string, unknown> =
		title === null
			? {}
			: {
					Name: {
						type: "title",
						title: [{ plain_text: title }],
					},
				};
	return { id, properties, ...extra };
}

describe("extractTitle", () => {
	test("reads the first title-type property regardless of key name", () => {
		const page: NotionSearchResult = {
			id: "p1",
			properties: {
				Status: { type: "select", select: { name: "Done" } },
				Heading: { type: "title", title: [{ plain_text: "My Page" }] },
			},
		};
		expect(extractTitle(page)).toBe("My Page");
	});

	test("falls back to Untitled when no title property exists", () => {
		expect(extractTitle(pageWithTitle("p1", null))).toBe("Untitled");
	});

	test("falls back to Untitled when the title is blank", () => {
		expect(extractTitle(pageWithTitle("p1", "   "))).toBe("Untitled");
	});
});

describe("buildSlug", () => {
	test("kebabs the title and appends the last 8 id chars", () => {
		const slug = buildSlug(
			"Hello World",
			"abcdef12-3456-7890-aaaa-bbbbccccdddd",
		);
		// Suffix = last 8 of id with dashes stripped.
		expect(slug).toBe("hello-world-ccccdddd");
	});

	test("uses a notion- stem when the title kebabs to empty", () => {
		const slug = buildSlug("日本語", "11112222333344445555666677778888");
		expect(slug).toBe("notion-77778888");
	});
});

describe("mapNotionPageToKnowledgeDoc", () => {
	test("maps a page to a knowledge document row", () => {
		const page = pageWithTitle("page-abcdef1234567890", "Roadmap", {
			url: "https://notion.so/Roadmap-abc",
			last_edited_time: "2026-02-02T12:00:00.000Z",
		});

		const doc = mapNotionPageToKnowledgeDoc(page, ctx);

		expect(doc.organizationId).toBe("org-1");
		expect(doc.title).toBe("Roadmap");
		expect(doc.slug).toBe("roadmap-34567890");
		expect(doc.sourceKind).toBe("file");
		expect(doc.type).toBe("note");
		expect(doc.markdown).toBe("");
		expect(doc.sourceRef).toMatchObject({
			importBatchId: "batch-1",
			notionPageId: "page-abcdef1234567890",
			notionUrl: "https://notion.so/Roadmap-abc",
		});
	});

	test("missing title falls back to Untitled in the row", () => {
		const doc = mapNotionPageToKnowledgeDoc(
			pageWithTitle("p-aabbccddeeff0011", null),
			ctx,
		);
		expect(doc.title).toBe("Untitled");
		expect(doc.slug).toBe("untitled-eeff0011");
	});

	test("two pages sharing a title get distinct slugs via the id suffix", () => {
		const a = mapNotionPageToKnowledgeDoc(
			pageWithTitle("aaaaaaaa11111111", "Notes"),
			ctx,
		);
		const b = mapNotionPageToKnowledgeDoc(
			pageWithTitle("bbbbbbbb22222222", "Notes"),
			ctx,
		);
		expect(a.slug).not.toBe(b.slug);
		expect(a.slug).toBe("notes-11111111");
		expect(b.slug).toBe("notes-22222222");
	});

	test("uses rendered markdown when provided by page id", () => {
		const doc = mapNotionPageToKnowledgeDoc(
			pageWithTitle("page-abcdef1234567890", "Roadmap"),
			{
				...ctx,
				markdownByPageId: new Map([
					["page-abcdef1234567890", "## Goals\n\n- Ship"],
				]),
			},
		);

		expect(doc.markdown).toBe("## Goals\n\n- Ship");
	});
});

describe("mapNotionPages", () => {
	test("maps an empty list to an empty array", () => {
		expect(mapNotionPages([], ctx)).toEqual([]);
	});

	test("filters out objects without a usable id", () => {
		const pages = [
			pageWithTitle("good-1234567890ab", "Keep"),
			{ id: "", properties: {} } as NotionSearchResult,
			{ properties: {} } as unknown as NotionSearchResult,
		];

		const docs = mapNotionPages(pages, ctx);

		expect(docs).toHaveLength(1);
		expect(docs[0]?.title).toBe("Keep");
	});
});

describe("renderNotionBlocksToMarkdown", () => {
	test("renders common block types to markdown", () => {
		const markdown = renderNotionBlocksToMarkdown([
			{
				id: "h1",
				type: "heading_1",
				heading_1: { rich_text: [{ plain_text: "Strategy" }] },
			},
			{
				id: "p1",
				type: "paragraph",
				paragraph: {
					rich_text: [
						{ plain_text: "Read " },
						{
							plain_text: "the docs",
							href: "https://example.com",
							annotations: { bold: true },
						},
					],
				},
			},
			{
				id: "todo",
				type: "to_do",
				to_do: {
					checked: true,
					rich_text: [{ plain_text: "Done" }],
				},
			},
			{
				id: "code",
				type: "code",
				code: {
					language: "typescript",
					rich_text: [{ plain_text: "const ok = true;" }],
				},
			},
			{
				id: "image",
				type: "image",
				image: {
					external: { url: "https://example.com/image.png" },
					caption: [{ plain_text: "Diagram" }],
				},
			},
		]);

		expect(markdown).toContain("# Strategy");
		expect(markdown).toContain("Read [**the docs**](https://example.com)");
		expect(markdown).toContain("- [x] Done");
		expect(markdown).toContain("```typescript\nconst ok = true;\n```");
		expect(markdown).toContain("[Diagram](https://example.com/image.png)");
	});

	test("preserves code block indentation without adding a blank line before the closing fence", () => {
		const markdown = renderNotionBlocksToMarkdown([
			{
				id: "code",
				type: "code",
				code: {
					language: "python",
					rich_text: [{ plain_text: "  def run():\n    return True\n" }],
				},
			},
		]);

		expect(markdown).toBe("```python\n  def run():\n    return True\n```");
	});

	test("renders code containing triple backticks without breaking fences", () => {
		const markdown = renderNotionBlocksToMarkdown([
			{
				id: "code-fence",
				type: "code",
				code: {
					language: "markdown",
					rich_text: [{ plain_text: "before\n```ts\nconst x = 1;\n```" }],
				},
			},
		]);

		expect(markdown).toContain("```ts");
		expect(markdown.startsWith("````markdown\n")).toBe(true);
		expect(markdown.endsWith("\n````")).toBe(true);
	});

	test("gives inline code annotation priority over other rich-text formatting", () => {
		const markdown = renderNotionBlocksToMarkdown([
			{
				id: "p1",
				type: "paragraph",
				paragraph: {
					rich_text: [
						{
							plain_text: "const ok = true",
							href: "https://example.com",
							annotations: {
								bold: true,
								italic: true,
								strikethrough: true,
								code: true,
							},
						},
					],
				},
			},
		]);

		expect(markdown).toBe("`const ok = true`");
	});

	test("renders nested child blocks under list items", () => {
		const markdown = renderNotionBlocksToMarkdown([
			{
				id: "list",
				type: "bulleted_list_item",
				has_children: true,
				bulleted_list_item: { rich_text: [{ plain_text: "Parent" }] },
				children: [
					{
						id: "child",
						type: "paragraph",
						paragraph: { rich_text: [{ plain_text: "Child body" }] },
					},
				],
			},
		]);

		expect(markdown).toBe("- Parent\n  Child body");
	});
});
