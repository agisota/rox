import { describe, expect, test } from "bun:test";
import {
	type AmbientJournalEvent,
	type AmbientMemoryItem,
	buildEventsBlock,
	buildMemoryBlock,
	buildNudgeContext,
	MAX_EVENTS,
	MAX_NUDGE_BODY_CHARS,
	MAX_NUDGE_TITLE_CHARS,
	MAX_PERSONA_CHARS,
	sanitizeNudge,
} from "./ambient-nudge";

describe("sanitizeNudge", () => {
	test("keeps a well-formed nudge and trims fields", () => {
		expect(
			sanitizeNudge({ title: "  Проверь PR  ", body: "  Открой #305  " }),
		).toEqual({ title: "Проверь PR", body: "Открой #305" });
	});

	test("returns null for a null nudge (model chose silence)", () => {
		expect(sanitizeNudge(null)).toBeNull();
	});

	test("returns null for a non-object", () => {
		expect(sanitizeNudge("nope")).toBeNull();
		expect(sanitizeNudge(42)).toBeNull();
		expect(sanitizeNudge(undefined)).toBeNull();
	});

	test("returns null when title or body is empty/whitespace (empty = no-op)", () => {
		expect(sanitizeNudge({ title: "", body: "x" })).toBeNull();
		expect(sanitizeNudge({ title: "x", body: "   " })).toBeNull();
		expect(sanitizeNudge({ title: "   ", body: "   " })).toBeNull();
		expect(sanitizeNudge({})).toBeNull();
	});

	test("hard-caps title and body length", () => {
		const nudge = sanitizeNudge({
			title: "т".repeat(MAX_NUDGE_TITLE_CHARS + 50),
			body: "б".repeat(MAX_NUDGE_BODY_CHARS + 200),
		});
		expect(nudge?.title).toHaveLength(MAX_NUDGE_TITLE_CHARS);
		expect(nudge?.body).toHaveLength(MAX_NUDGE_BODY_CHARS);
	});
});

describe("buildMemoryBlock", () => {
	const items: AmbientMemoryItem[] = [
		{ category: "projects", body: "работает над Rox monorepo" },
		{ category: "instructions", body: "отвечать по-русски" },
		{ category: "identity", body: "solo-founder" },
	];

	test("returns '' for no items (true no-op)", () => {
		expect(buildMemoryBlock([])).toBe("");
	});

	test("drops empty bodies", () => {
		expect(buildMemoryBlock([{ category: "general", body: "   " }])).toBe("");
	});

	test("leads with instructions + identity and groups by category", () => {
		const block = buildMemoryBlock(items);
		const instrIdx = block.indexOf("Предпочтения и правила");
		const projIdx = block.indexOf("Проекты");
		expect(instrIdx).toBeGreaterThanOrEqual(0);
		expect(projIdx).toBeGreaterThan(instrIdx);
		expect(block).toContain("- solo-founder");
	});
});

describe("buildEventsBlock", () => {
	test("returns '' for no events", () => {
		expect(buildEventsBlock([])).toBe("");
	});

	test("renders newest-first with summary and caps the count", () => {
		const many: AmbientJournalEvent[] = Array.from(
			{ length: MAX_EVENTS + 10 },
			(_, i) => ({
				title: `Событие ${i}`,
				summary: i === 0 ? "последнее" : null,
				createdAt: new Date(2026, 0, 1, 0, i),
			}),
		);
		const block = buildEventsBlock(many);
		const lines = block.split("\n");
		expect(lines).toHaveLength(MAX_EVENTS);
		// Newest (highest minute) first.
		expect(lines[0]).toContain(`Событие ${MAX_EVENTS + 9}`);
	});
});

describe("buildNudgeContext", () => {
	test("returns null when there is no signal at all (no memories, no events)", () => {
		expect(buildNudgeContext({ memories: [], events: [] })).toBeNull();
	});

	test("builds a context when there are memories only", () => {
		const ctx = buildNudgeContext({
			memories: [{ category: "identity", body: "solo-founder" }],
			events: [],
		});
		expect(ctx).toContain("Что известно о пользователе");
		expect(ctx).toContain("solo-founder");
		expect(ctx).toContain("(нет недавних событий)");
	});

	test("builds a context when there are events only", () => {
		const ctx = buildNudgeContext({
			memories: [],
			events: [
				{ title: "Автоматизация X", summary: null, createdAt: new Date() },
			],
		});
		expect(ctx).toContain("Последние события");
		expect(ctx).toContain("Автоматизация X");
		expect(ctx).toContain("(нет сохранённых фактов)");
	});

	test("includes the persona and caps its length", () => {
		const ctx = buildNudgeContext({
			memories: [{ category: "identity", body: "x" }],
			events: [],
			persona: "p".repeat(MAX_PERSONA_CHARS + 100),
		});
		expect(ctx).toContain("Желаемый стиль ассистента");
		const personaLine = ctx?.split("\n")[1] ?? "";
		expect(personaLine.length).toBeLessThanOrEqual(MAX_PERSONA_CHARS);
	});
});
