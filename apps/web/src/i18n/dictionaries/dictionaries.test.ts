import { describe, expect, test } from "bun:test";

import { LOCALES } from "../constants";
import { dictionaries } from "./index";

/** Recursively collect dot-paths of every leaf string key. */
function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
	return Object.entries(obj).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "object" && value !== null
			? leafKeys(value as Record<string, unknown>, path)
			: [path];
	});
}

describe("i18n dictionaries", () => {
	const enKeys = leafKeys(dictionaries.en).sort();

	test("every locale is registered", () => {
		for (const locale of LOCALES) {
			expect(dictionaries[locale]).toBeDefined();
		}
	});

	test("every locale has the same keys as the English source", () => {
		for (const locale of LOCALES) {
			expect(leafKeys(dictionaries[locale]).sort()).toEqual(enKeys);
		}
	});

	test("every translated value is a non-empty string", () => {
		for (const locale of LOCALES) {
			for (const value of Object.values(dictionaries[locale]).flatMap((ns) =>
				Object.values(ns),
			)) {
				expect(typeof value).toBe("string");
				expect((value as string).length).toBeGreaterThan(0);
			}
		}
	});

	test("Russian is fully translated (differs from English where expected)", () => {
		expect(dictionaries.ru.auth.welcomeBack).toBe("С возвращением");
		expect(dictionaries.ru.nav.home).toBe("Главная");
		expect(dictionaries.ru.common.save).toBe("Сохранить");
	});
});
