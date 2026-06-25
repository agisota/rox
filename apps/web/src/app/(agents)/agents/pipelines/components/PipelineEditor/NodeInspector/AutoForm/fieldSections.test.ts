import { describe, expect, test } from "bun:test";
import type { NodeFieldDef } from "@rox/workflow-core";
import {
	DEFAULT_SECTION,
	groupFieldSections,
	shouldShowSectionHeadings,
} from "./fieldSections";

function field(key: string, section?: string): NodeFieldDef {
	return { key, kind: "text", label: key, section };
}

describe("groupFieldSections (web)", () => {
	test("unsectioned fields collapse into a single default group (flat form)", () => {
		const sections = groupFieldSections([field("a"), field("b")]);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.label).toBe(DEFAULT_SECTION);
		expect(sections[0]?.fields.map((f) => f.key)).toEqual(["a", "b"]);
		expect(shouldShowSectionHeadings(sections)).toBe(false);
	});

	test("sections appear in first-declared order, fields keep declared order", () => {
		const sections = groupFieldSections([
			field("role"),
			field("model", "Параметры модели"),
			field("turns", "Параметры модели"),
		]);
		expect(sections.map((s) => s.label)).toEqual([
			DEFAULT_SECTION,
			"Параметры модели",
		]);
		expect(sections[1]?.fields.map((f) => f.key)).toEqual(["model", "turns"]);
		expect(shouldShowSectionHeadings(sections)).toBe(true);
	});

	test("interleaved section labels still group (not re-split)", () => {
		const sections = groupFieldSections([
			field("a", "X"),
			field("b", "Y"),
			field("c", "X"),
		]);
		expect(sections.map((s) => s.label)).toEqual(["X", "Y"]);
		expect(sections[0]?.fields.map((f) => f.key)).toEqual(["a", "c"]);
	});

	test("empty fields yield no sections", () => {
		expect(groupFieldSections([])).toEqual([]);
	});
});
