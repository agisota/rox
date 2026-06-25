import { describe, expect, it } from "bun:test";
import {
	annotateMemoryContextItems,
	buildMemoryContextBlock,
	MEMORY_CONTEXT_MAX_CHARS,
	MEMORY_CONTEXT_MAX_ITEMS,
	type MemoryContextItem,
	selectMemoryContextItems,
} from "./memory-context";

function item(
	overrides: Partial<MemoryContextItem> & { body: string },
): MemoryContextItem {
	return {
		category: "general",
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

describe("buildMemoryContextBlock", () => {
	it("returns null for an empty list (no-op)", () => {
		expect(buildMemoryContextBlock([])).toBeNull();
	});

	it("returns null when every item body is blank", () => {
		expect(
			buildMemoryContextBlock([item({ body: "   " }), item({ body: "\n\t" })]),
		).toBeNull();
	});

	it("renders RU group headers matching the MemoryView labels", () => {
		const block = buildMemoryContextBlock([
			item({ category: "projects", body: "Строю Rox" }),
			item({ category: "identity", body: "Solo-founder" }),
			item({ category: "instructions", body: "Отвечай на русском" }),
			item({ category: "career", body: "Был инженером" }),
			item({ category: "general", body: "Всегда BLUF" }),
		]);
		const text = block as string;
		expect(text).toContain("## Проекты");
		expect(text).toContain("## Личное");
		expect(text).toContain("## Предпочтения и правила");
		expect(text).toContain("## Карьера и история");
		expect(text).toContain("## Общие правила и принципы");
	});

	it("orders instructions and identity groups ahead of the rest", () => {
		const block = buildMemoryContextBlock([
			item({
				category: "general",
				body: "general-item",
				updatedAt: "2026-06-19T00:00:00.000Z",
			}),
			item({
				category: "projects",
				body: "projects-item",
				updatedAt: "2026-06-18T00:00:00.000Z",
			}),
			item({
				category: "identity",
				body: "identity-item",
				updatedAt: "2020-01-01T00:00:00.000Z",
			}),
			item({
				category: "instructions",
				body: "instructions-item",
				updatedAt: "2019-01-01T00:00:00.000Z",
			}),
		]) as string;

		const idxInstructions = block.indexOf("## Предпочтения и правила");
		const idxIdentity = block.indexOf("## Личное");
		const idxProjects = block.indexOf("## Проекты");
		const idxGeneral = block.indexOf("## Общие правила и принципы");

		expect(idxInstructions).toBeGreaterThanOrEqual(0);
		expect(idxIdentity).toBeGreaterThan(idxInstructions);
		expect(idxProjects).toBeGreaterThan(idxIdentity);
		expect(idxGeneral).toBeGreaterThan(idxProjects);
	});

	it("caps the number of injected items", () => {
		const many = Array.from({ length: MEMORY_CONTEXT_MAX_ITEMS + 10 }, (_, i) =>
			item({
				category: "general",
				body: `m${i}`,
				updatedAt: new Date(2026, 0, 1, 0, 0, i),
			}),
		);
		const block = buildMemoryContextBlock(many) as string;
		const bulletCount = (block.match(/^- /gm) ?? []).length;
		expect(bulletCount).toBe(MEMORY_CONTEXT_MAX_ITEMS);
	});

	it("caps total characters but always keeps at least one item", () => {
		const huge = "x".repeat(MEMORY_CONTEXT_MAX_CHARS + 500);
		const block = buildMemoryContextBlock([
			item({ category: "general", body: huge }),
			item({ category: "general", body: "second" }),
		]) as string;
		expect(block).toContain(huge);
		expect(block).not.toContain("- second");
	});
});

describe("annotateMemoryContextItems", () => {
	it("marks items beyond the count cap as not included, preserving order", () => {
		const many = Array.from({ length: MEMORY_CONTEXT_MAX_ITEMS + 5 }, (_, i) =>
			item({
				category: "general",
				body: `m${i}`,
				updatedAt: new Date(2026, 0, 1, 0, 0, i),
			}),
		);
		const annotated = annotateMemoryContextItems(many);
		expect(annotated.length).toBe(many.length);
		const includedCount = annotated.filter((e) => e.included).length;
		expect(includedCount).toBe(MEMORY_CONTEXT_MAX_ITEMS);
		// Everything after the cap is greyed out.
		expect(
			annotated.slice(MEMORY_CONTEXT_MAX_ITEMS).every((e) => !e.included),
		).toBe(true);
	});

	it("excludes blank-body items", () => {
		const annotated = annotateMemoryContextItems([
			item({ body: "real" }),
			item({ body: "   " }),
		]);
		const blank = annotated.find((e) => e.item.body === "   ");
		expect(blank?.included).toBe(false);
	});

	it("matches the block contents exactly (preview === injected)", () => {
		const items = [
			item({ category: "instructions", body: "правило" }),
			item({ category: "general", body: "факт" }),
		];
		const includedBodies = annotateMemoryContextItems(items)
			.filter((e) => e.included)
			.map((e) => e.body);
		const selected = selectMemoryContextItems(items).map((s) => s.body);
		expect(includedBodies).toEqual(selected);
		const block = buildMemoryContextBlock(items) as string;
		for (const body of selected) {
			expect(block).toContain(`- ${body}`);
		}
	});
});
