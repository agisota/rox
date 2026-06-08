import { describe, expect, test } from "bun:test";
import {
	ALLOWED_MDX_COMPONENTS,
	analyzeMdxSecurity,
	assertMdxSafe,
	isMdxSafe,
	MdxSecurityError,
} from "./mdx-security";
import {
	extractTags,
	extractWikiLinkTargets,
	normalizeWikiLinkTarget,
	parseWikiLinks,
} from "./wikilinks";

describe("analyzeMdxSecurity", () => {
	test("accepts plain markdown", () => {
		const result = analyzeMdxSecurity(
			"# Hello\n\nSome **bold** text and a [link](/x).",
		);
		expect(result.ok).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	test("accepts whitelisted components", () => {
		const src = `<Callout>hi</Callout>\n\n<Mermaid />\n\n<Card title="t" />`;
		expect(isMdxSafe(src)).toBe(true);
	});

	test("every allowed component is actually allowed", () => {
		for (const name of ALLOWED_MDX_COMPONENTS) {
			expect(isMdxSafe(`<${name} />`)).toBe(true);
		}
	});

	test("rejects non-whitelisted components", () => {
		const result = analyzeMdxSecurity("<EvilWidget />");
		expect(result.ok).toBe(false);
		expect(
			result.violations.some((v) => v.rule === "disallowed-component"),
		).toBe(true);
		expect(
			result.violations.find((v) => v.rule === "disallowed-component")?.match,
		).toBe("EvilWidget");
	});

	test("rejects import statements", () => {
		const result = analyzeMdxSecurity('import x from "fs"\n\n# hi');
		expect(result.ok).toBe(false);
		expect(result.violations.some((v) => v.rule === "import")).toBe(true);
	});

	test("rejects export statements", () => {
		const result = analyzeMdxSecurity("export const x = 1\n\n# hi");
		expect(result.violations.some((v) => v.rule === "export")).toBe(true);
	});

	test("rejects script tags", () => {
		const result = analyzeMdxSecurity("<script>alert(1)</script>");
		expect(result.violations.some((v) => v.rule === "script")).toBe(true);
	});

	test("rejects inline event handlers", () => {
		const result = analyzeMdxSecurity('<img src="x" onerror="alert(1)" />');
		expect(result.violations.some((v) => v.rule === "html-event-handler")).toBe(
			true,
		);
	});

	test("rejects javascript: uris", () => {
		const result = analyzeMdxSecurity('<a href="javascript:alert(1)">x</a>');
		expect(result.violations.some((v) => v.rule === "javascript-uri")).toBe(
			true,
		);
	});

	test("rejects JS expression containers", () => {
		const result = analyzeMdxSecurity("Value: {process.env.SECRET}");
		expect(result.violations.some((v) => v.rule === "expression")).toBe(true);
	});

	test("assertMdxSafe throws MdxSecurityError with violations", () => {
		expect(() => assertMdxSafe("<EvilWidget />")).toThrow(MdxSecurityError);
		try {
			assertMdxSafe("import x from 'y'");
		} catch (err) {
			expect(err).toBeInstanceOf(MdxSecurityError);
			expect((err as MdxSecurityError).violations.length).toBeGreaterThan(0);
		}
	});

	test("assertMdxSafe is a no-op for safe MDX", () => {
		expect(() =>
			assertMdxSafe("# safe\n\n<Steps><Step>1</Step></Steps>"),
		).not.toThrow();
	});
});

describe("wikilinks", () => {
	test("parses simple, aliased, and embed links", () => {
		const links = parseWikiLinks(
			"See [[my-note]] and [[other|Other Title]] and ![[diagram]]",
		);
		expect(links).toHaveLength(3);
		expect(links[0]).toMatchObject({ target: "my-note", embed: false });
		expect(links[1]).toMatchObject({ target: "other", alias: "Other Title" });
		expect(links[2]).toMatchObject({ target: "diagram", embed: true });
	});

	test("normalizes targets to kebab slugs and strips anchors", () => {
		expect(normalizeWikiLinkTarget("My Note #heading")).toBe("my-note");
		expect(normalizeWikiLinkTarget("Folder/Sub Note")).toBe("folder/sub-note");
	});

	test("extractWikiLinkTargets dedupes", () => {
		expect(extractWikiLinkTargets("[[a]] [[a]] [[b]]")).toEqual(["a", "b"]);
	});

	test("extractTags collects hashtags", () => {
		expect(extractTags("hello #foo and #Bar/baz").sort()).toEqual([
			"bar/baz",
			"foo",
		]);
	});
});
