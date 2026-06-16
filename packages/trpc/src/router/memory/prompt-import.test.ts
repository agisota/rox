import { describe, expect, test } from "bun:test";
import { parsePromptImport } from "./prompt-import";

describe("parsePromptImport", () => {
	test("parses the canonical Claude-style dump", () => {
		const dump = `## Instructions
[2026-01-15] - Всегда отвечай на русском
[2026-01-16] - Используй BLUF

## Identity
[2026-01-10] - Solo founder

## Projects
[2026-02-01] - Работает над Rox`;
		expect(parsePromptImport(dump)).toEqual([
			{ category: "instructions", body: "Всегда отвечай на русском" },
			{ category: "instructions", body: "Используй BLUF" },
			{ category: "identity", body: "Solo founder" },
			{ category: "projects", body: "Работает над Rox" },
		]);
	});

	test("folds Preferences into instructions", () => {
		const dump = `Preferences:
- Тёмная тема
- Краткие ответы`;
		expect(parsePromptImport(dump)).toEqual([
			{ category: "instructions", body: "Тёмная тема" },
			{ category: "instructions", body: "Краткие ответы" },
		]);
	});

	test("maps Career and handles bold headers + plain lines", () => {
		const dump = `**Career**
Был CTO в стартапе
Пишет на TypeScript`;
		expect(parsePromptImport(dump)).toEqual([
			{ category: "career", body: "Был CTO в стартапе" },
			{ category: "career", body: "Пишет на TypeScript" },
		]);
	});

	test("ignores text before the first recognized header", () => {
		const dump = `Вот мои воспоминания:
случайный текст
## Identity
[2026-01-01] - Зовут Рамзан`;
		expect(parsePromptImport(dump)).toEqual([
			{ category: "identity", body: "Зовут Рамзан" },
		]);
	});

	test("returns empty for a dump with no recognized headers", () => {
		expect(parsePromptImport("просто текст без категорий")).toEqual([]);
	});
});
