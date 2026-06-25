import { describe, expect, test } from "bun:test";
import {
	buildGalleryGroups,
	countTemplates,
	templateNodeTypes,
} from "./galleryModel";

describe("template gallery model", () => {
	test("groups templates by category, preserving catalog order", () => {
		const groups = buildGalleryGroups("");
		expect(groups.length).toBeGreaterThanOrEqual(4);
		// First template is the blank ("Базовые"), so that group leads.
		expect(groups[0]?.category).toBe("Базовые");
		// No empty groups.
		for (const g of groups) expect(g.templates.length).toBeGreaterThan(0);
	});

	test("search matches name, description, category, and tags", () => {
		// name
		expect(
			buildGalleryGroups("RAG").some((g) =>
				g.templates.some((t) => t.id === "rag-bot"),
			),
		).toBe(true);
		// tag ("etl")
		expect(
			buildGalleryGroups("etl").some((g) =>
				g.templates.some((t) => t.id === "etl-http-db"),
			),
		).toBe(true);
		// category ("Логика")
		expect(
			buildGalleryGroups("Логика").every((g) => g.category === "Логика"),
		).toBe(true);
	});

	test("search is case-insensitive and trims", () => {
		const groups = buildGalleryGroups("  classifier  ");
		expect(
			groups.some((g) => g.templates.some((t) => t.id === "classifier-router")),
		).toBe(true);
	});

	test("a non-matching query yields no groups", () => {
		const groups = buildGalleryGroups("zzz-nope");
		expect(groups).toEqual([]);
		expect(countTemplates(groups)).toBe(0);
	});

	test("countTemplates equals the full catalog for an empty query", () => {
		const groups = buildGalleryGroups("");
		expect(countTemplates(groups)).toBeGreaterThanOrEqual(10);
	});

	test("templateNodeTypes returns the distinct block types of a template", () => {
		const groups = buildGalleryGroups("etl");
		const etl = groups
			.flatMap((g) => g.templates)
			.find((t) => t.id === "etl-http-db");
		if (!etl) throw new Error("etl template missing");
		const types = templateNodeTypes(etl);
		expect(types).toContain("http_request");
		expect(types).toContain("transform");
		expect(types).toContain("db_write");
		// distinct (no dupes)
		expect(new Set(types).size).toBe(types.length);
	});
});
