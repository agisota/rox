import { describe, expect, test } from "bun:test";
// Import the pure local transform directly (not `promptEdit.ts`, which imports
// the tRPC client) so this stays a network-free unit test of the fallback path.
import { composeLocally, parseReplaceDirective } from "./promptEditLocal";

const HEADING = "## Правки (через чат)";

describe("composeLocally (deterministic local fallback)", () => {
	test("empty current prompt → instruction becomes the body", () => {
		const result = composeLocally("", "Следи за деплоями");
		expect(result.prompt).toBe("Следи за деплоями");
		expect(result.note).toContain("создан");
	});

	test("whitespace-only current prompt → instruction becomes the body", () => {
		const result = composeLocally("   \n  ", "Новый промпт");
		expect(result.prompt).toBe("Новый промпт");
	});

	test("RU «замени X на Y» → substitution + note", () => {
		const result = composeLocally(
			"Ищи сбои в проде",
			"замени проде на стейджинге",
		);
		expect(result.prompt).toBe("Ищи сбои в стейджинге");
		expect(result.note).toContain("Заменено");
	});

	test("EN «replace A with B» → substitution", () => {
		const result = composeLocally(
			"Watch the prod logs",
			"replace prod with dev",
		);
		expect(result.prompt).toBe("Watch the dev logs");
	});

	test("substring not found → unchanged + explanatory note", () => {
		const result = composeLocally("Ищи сбои", "замени XYZ на ABC");
		expect(result.prompt).toBe("Ищи сбои");
		expect(result.note).toContain("не найдено");
	});

	test("free-form instruction → appended under the heading", () => {
		const result = composeLocally("Базовый промпт", "Добавь проверку Sentry");
		expect(result.prompt).toContain(HEADING);
		expect(result.prompt).toContain("- Добавь проверку Sentry");
		expect(result.note).toContain("добавлена");
	});

	test("second free-form append → extra bullet, no duplicate heading", () => {
		const first = composeLocally("Базовый промпт", "Добавь проверку Sentry");
		const second = composeLocally(first.prompt, "И ещё проверку GitHub");

		// Exactly one heading even after two appends.
		const headingCount = second.prompt.split(HEADING).length - 1;
		expect(headingCount).toBe(1);
		expect(second.prompt).toContain("- Добавь проверку Sentry");
		expect(second.prompt).toContain("- И ещё проверку GitHub");
	});
});

describe("parseReplaceDirective", () => {
	test("parses RU замени directive (strips quotes)", () => {
		expect(parseReplaceDirective("замени «прод» на «стейдж»")).toEqual({
			from: "прод",
			to: "стейдж",
		});
	});

	test("parses RU заменить variant", () => {
		expect(parseReplaceDirective("заменить foo на bar")).toEqual({
			from: "foo",
			to: "bar",
		});
	});

	test("parses EN replace directive", () => {
		expect(parseReplaceDirective("replace foo with bar")).toEqual({
			from: "foo",
			to: "bar",
		});
	});

	test("returns null for a non-directive instruction", () => {
		expect(parseReplaceDirective("Добавь проверку Sentry")).toBeNull();
	});
});
