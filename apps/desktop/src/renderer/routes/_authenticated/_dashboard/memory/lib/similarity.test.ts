import { describe, expect, it } from "bun:test";
import type { SelectMemoryItem } from "@rox/db/schema";
import {
	findSimilarCluster,
	SIMILARITY_THRESHOLD,
	similarity,
} from "./similarity";

function mem(
	overrides: Partial<SelectMemoryItem> & { id: string; body: string },
): SelectMemoryItem {
	return {
		organizationId: "org",
		createdBy: "user",
		category: "general",
		source: "manual",
		status: "approved",
		sourceRef: null,
		importJobId: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	} as SelectMemoryItem;
}

describe("similarity", () => {
	it("is 1 for identical text (case/whitespace-insensitive)", () => {
		expect(similarity("Hello World", "  hello   world ")).toBe(1);
	});

	it("is 0 for empty input", () => {
		expect(similarity("", "")).toBe(0);
		expect(similarity("abc", "")).toBe(0);
	});

	it("is high for near-duplicate phrasing", () => {
		expect(
			similarity(
				"Я предпочитаю отвечать на русском языке",
				"Я предпочитаю отвечать по-русски на языке",
			),
		).toBeGreaterThan(SIMILARITY_THRESHOLD);
	});

	it("is low for unrelated text", () => {
		expect(
			similarity("Строю десктоп-приложение", "Люблю кофе по утрам"),
		).toBeLessThan(SIMILARITY_THRESHOLD);
	});
});

describe("findSimilarCluster", () => {
	it("returns null when nothing else is similar", () => {
		const seed = mem({ id: "1", body: "Уникальная запись про X" });
		const others = [mem({ id: "2", body: "Совсем другое про Y" })];
		expect(findSimilarCluster(seed, [seed, ...others])).toBeNull();
	});

	it("clusters near-duplicates including the seed, newest first", () => {
		const seed = mem({
			id: "1",
			body: "Всегда отвечай кратко и по делу",
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		const dup = mem({
			id: "2",
			body: "Всегда отвечай кратко, по делу",
			updatedAt: new Date("2026-06-01T00:00:00.000Z"),
		});
		const unrelated = mem({ id: "3", body: "Я живу в Лондоне" });
		const cluster = findSimilarCluster(seed, [seed, dup, unrelated]);
		expect(cluster).not.toBeNull();
		expect(cluster?.members.map((m) => m.id)).toEqual(["2", "1"]);
	});
});
