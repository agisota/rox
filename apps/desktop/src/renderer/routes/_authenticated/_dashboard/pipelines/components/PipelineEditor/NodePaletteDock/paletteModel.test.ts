import { describe, expect, test } from "bun:test";
import { NodeCategory } from "@rox/workflow-core";
import {
	buildPaletteGroups,
	countEntries,
	PALETTE_DND_MIME,
} from "./paletteModel";

describe("palette model (registry-driven)", () => {
	test("groups every non-singleton node type by category, in order", () => {
		const groups = buildPaletteGroups("");
		const categories = groups.map((g) => g.category);
		// At minimum the catalog spans these categories.
		expect(categories).toContain(NodeCategory.Input);
		expect(categories).toContain(NodeCategory.AI);
		expect(categories).toContain(NodeCategory.Logic);
		// Category order is preserved (Input before AI before Logic).
		expect(categories.indexOf(NodeCategory.Input)).toBeLessThan(
			categories.indexOf(NodeCategory.AI),
		);
		expect(categories.indexOf(NodeCategory.AI)).toBeLessThan(
			categories.indexOf(NodeCategory.Logic),
		);
	});

	test("excludes the start singleton from the palette", () => {
		const ids = buildPaletteGroups("").flatMap((g) =>
			g.entries.map((e) => e.id),
		);
		expect(ids).not.toContain("start");
		// But other addable types are present.
		expect(ids).toContain("agent_run");
		expect(ids).toContain("condition");
		expect(ids).toContain("model");
	});

	test("search matches label, description, id, and category label", () => {
		// label match
		expect(
			buildPaletteGroups("условие")
				.flatMap((g) => g.entries.map((e) => e.id))
				.includes("condition"),
		).toBe(true);
		// id match
		expect(
			buildPaletteGroups("http_request")
				.flatMap((g) => g.entries.map((e) => e.id))
				.includes("http_request"),
		).toBe(true);
		// category-label match ("Данные" should surface the Data category nodes)
		const dataHits = buildPaletteGroups("Данные");
		expect(dataHits.some((g) => g.category === NodeCategory.Data)).toBe(true);
	});

	test("search is case-insensitive and trims", () => {
		const a = buildPaletteGroups("  MODEL  ");
		expect(a.flatMap((g) => g.entries.map((e) => e.id))).toContain("model");
	});

	test("a non-matching query yields zero entries", () => {
		const groups = buildPaletteGroups("zzz-not-a-node-zzz");
		expect(countEntries(groups)).toBe(0);
		expect(groups).toEqual([]);
	});

	test("countEntries sums entries across groups", () => {
		const groups = buildPaletteGroups("");
		const manual = groups.reduce((n, g) => n + g.entries.length, 0);
		expect(countEntries(groups)).toBe(manual);
		expect(manual).toBeGreaterThan(10);
	});

	test("each entry carries the registry icon name + category", () => {
		const cond = buildPaletteGroups("условие")
			.flatMap((g) => g.entries)
			.find((e) => e.id === "condition");
		expect(cond?.icon).toBe("GitFork");
		expect(cond?.category).toBe(NodeCategory.Logic);
	});

	test("the drag MIME type is stable", () => {
		expect(PALETTE_DND_MIME).toBe("application/rox-pipeline-node");
	});
});
