import { describe, expect, test } from "bun:test";
import {
	MAX_MEMORIES_PER_SESSION,
	sanitizeSessionMemories,
} from "./session-learn";

describe("sanitizeSessionMemories", () => {
	test("keeps well-formed memories and trims bodies", () => {
		const result = sanitizeSessionMemories([
			{ body: "  пользователь — solo-founder  ", category: "identity" },
			{ body: "работает над Rox monorepo", category: "projects" },
		]);
		expect(result).toEqual([
			{ body: "пользователь — solo-founder", category: "identity" },
			{ body: "работает над Rox monorepo", category: "projects" },
		]);
	});

	test("coerces an unknown category to general", () => {
		const result = sanitizeSessionMemories([
			{ body: "факт", category: "nonsense" },
		]);
		expect(result).toEqual([{ body: "факт", category: "general" }]);
	});

	test("defaults a missing category to general", () => {
		const result = sanitizeSessionMemories([{ body: "факт" }]);
		expect(result).toEqual([{ body: "факт", category: "general" }]);
	});

	test("drops empty / whitespace-only bodies", () => {
		const result = sanitizeSessionMemories([
			{ body: "   ", category: "projects" },
			{ body: "ок", category: "instructions" },
		]);
		expect(result).toEqual([{ body: "ок", category: "instructions" }]);
	});

	test("ignores non-object and null entries", () => {
		const result = sanitizeSessionMemories([
			null,
			"строка",
			42,
			{ body: "валидно", category: "career" },
		]);
		expect(result).toEqual([{ body: "валидно", category: "career" }]);
	});

	test("returns [] for non-array / nullish input", () => {
		expect(sanitizeSessionMemories(null)).toEqual([]);
		expect(sanitizeSessionMemories(undefined)).toEqual([]);
		expect(sanitizeSessionMemories({ memories: [] })).toEqual([]);
		expect(sanitizeSessionMemories("nope")).toEqual([]);
	});

	test("caps the number of memories per session", () => {
		const many = Array.from(
			{ length: MAX_MEMORIES_PER_SESSION + 5 },
			(_, i) => ({
				body: `факт ${i}`,
				category: "general",
			}),
		);
		const result = sanitizeSessionMemories(many);
		expect(result).toHaveLength(MAX_MEMORIES_PER_SESSION);
		expect(result[0]).toEqual({ body: "факт 0", category: "general" });
	});
});
