import { describe, expect, it } from "bun:test";
import { parseObsidianNote } from "./parse-note";

describe("parseObsidianNote", () => {
	it("derives title and tags from frontmatter", () => {
		const result = parseObsidianNote({
			path: "Notes/Project Plan.md",
			content: [
				"---",
				"title: Quarterly Plan",
				"tags: [planning, q3]",
				"---",
				"",
				"# Heading That Is Ignored",
				"",
				"Body copy.",
			].join("\n"),
		});

		expect(result.title).toBe("Quarterly Plan");
		expect(result.tags).toEqual(["planning", "q3"]);
		expect(result.slug).toBe("notes/project-plan");
		expect(result.sourceKind).toBe("obsidian_import");
		expect(result.sourceRef).toEqual({ filePath: "Notes/Project Plan.md" });
		// Frontmatter block is stripped from the markdown body.
		expect(result.markdown).not.toContain("title: Quarterly Plan");
		expect(result.markdown).toContain("Body copy.");
		expect(result.frontmatter.title).toBe("Quarterly Plan");
	});

	it("falls back to the first H1 when frontmatter has no title", () => {
		const result = parseObsidianNote({
			path: "ideas/spark.md",
			content: ["", "## Not an H1", "", "# Real Title", "", "Text"].join("\n"),
		});

		expect(result.title).toBe("Real Title");
		expect(result.slug).toBe("ideas/spark");
	});

	it("falls back to the filename when there is no frontmatter title or H1", () => {
		const result = parseObsidianNote({
			path: "vault/sub dir/My Loose Note.md",
			content: "Just some prose without any heading.",
		});

		// Title = basename without the .md extension.
		expect(result.title).toBe("My Loose Note");
		// Slug = kebab of the full path.
		expect(result.slug).toBe("vault/sub-dir/my-loose-note");
	});

	it("extracts and dedupes wikilink targets as kebab slugs", () => {
		const result = parseObsidianNote({
			path: "graph.md",
			content: [
				"Links to [[First Note]] and [[Second Note|alias]].",
				"Repeat link to [[First Note]] and an embed ![[First Note]].",
				"Also [[Nested/Path Note]].",
			].join("\n"),
		});

		expect(result.wikilinks).toEqual([
			"first-note",
			"second-note",
			"nested/path-note",
		]);
	});

	it("merges frontmatter tags with inline #tags and dedupes", () => {
		const result = parseObsidianNote({
			path: "tagged.md",
			content: [
				"---",
				"tags: [alpha, beta]",
				"---",
				"",
				"Body with #beta and #gamma inline tags.",
			].join("\n"),
		});

		expect(result.tags).toEqual(["alpha", "beta", "gamma"]);
	});

	it("handles empty content without throwing", () => {
		const result = parseObsidianNote({ path: "empty.md", content: "" });

		expect(result.title).toBe("empty");
		expect(result.slug).toBe("empty");
		expect(result.markdown).toBe("");
		expect(result.frontmatter).toEqual({});
		expect(result.tags).toEqual([]);
		expect(result.wikilinks).toEqual([]);
		expect(result.sourceKind).toBe("obsidian_import");
		expect(result.sourceRef).toEqual({ filePath: "empty.md" });
	});

	it("degrades gracefully on malformed frontmatter", () => {
		// Unterminated frontmatter block: no closing `---`, so the whole thing is
		// treated as body content and parsing must not throw.
		const result = parseObsidianNote({
			path: "broken.md",
			content: [
				"---",
				"title: Broken",
				"tags: [oops",
				"this line has no key value",
				"",
				"# Recovered Title",
				"Body still readable.",
			].join("\n"),
		});

		expect(() =>
			parseObsidianNote({ path: "broken.md", content: "---\nonly start" }),
		).not.toThrow();
		// No closing fence → frontmatter is empty and the H1 supplies the title.
		expect(result.frontmatter).toEqual({});
		expect(result.title).toBe("Recovered Title");
		expect(result.markdown).toContain("Body still readable.");
		expect(result.sourceKind).toBe("obsidian_import");
	});
});
