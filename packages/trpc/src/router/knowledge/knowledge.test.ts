import { describe, expect, test } from "bun:test";
import { assertMdxSafe, MdxSecurityError } from "@rox/shared/knowledge";
import {
	createKnowledgeSchema,
	getKnowledgeSchema,
	searchKnowledgeSchema,
	updateKnowledgeSchema,
} from "./schema";

describe("knowledge schemas", () => {
	test("createKnowledgeSchema applies defaults", () => {
		const parsed = createKnowledgeSchema.parse({
			slug: "my-note",
			title: "My Note",
		});
		expect(parsed.type).toBe("note");
		expect(parsed.sourceKind).toBe("manual");
		expect(parsed.tags).toEqual([]);
	});

	test("createKnowledgeSchema rejects non-kebab slugs", () => {
		expect(() =>
			createKnowledgeSchema.parse({ slug: "Not A Slug", title: "x" }),
		).toThrow();
		expect(() =>
			createKnowledgeSchema.parse({ slug: "Bad_Slug", title: "x" }),
		).toThrow();
	});

	test("createKnowledgeSchema accepts nested path slugs", () => {
		expect(
			createKnowledgeSchema.parse({ slug: "folder/sub-note", title: "x" }).slug,
		).toBe("folder/sub-note");
	});

	test("searchKnowledgeSchema defaults limit", () => {
		expect(searchKnowledgeSchema.parse({ query: "hi" }).limit).toBe(25);
	});

	test("getKnowledgeSchema requires a slug", () => {
		expect(() => getKnowledgeSchema.parse({})).toThrow();
	});

	test("updateKnowledgeSchema requires id and allows partial fields", () => {
		const parsed = updateKnowledgeSchema.parse({
			id: "00000000-0000-0000-0000-000000000000",
			title: "Renamed",
		});
		expect(parsed.title).toBe("Renamed");
	});
});

describe("knowledge MDX security wiring", () => {
	test("router-level guard rejects disallowed components", () => {
		expect(() => assertMdxSafe("<EvilWidget />")).toThrow(MdxSecurityError);
	});

	test("router-level guard rejects imports/scripts", () => {
		expect(() => assertMdxSafe("import x from 'fs'")).toThrow(MdxSecurityError);
		expect(() => assertMdxSafe("<script>alert(1)</script>")).toThrow(
			MdxSecurityError,
		);
	});

	test("router-level guard allows whitelisted MDX", () => {
		expect(() =>
			assertMdxSafe("# Title\n\n<Callout>note</Callout>"),
		).not.toThrow();
	});
});
