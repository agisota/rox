import { describe, expect, test } from "bun:test";
import { miniMapColorForType } from "./miniMapColor";

describe("miniMapColorForType", () => {
	test("uses the node type's own render.miniMapColor", () => {
		// start declares emerald; condition declares violet.
		expect(miniMapColorForType("start")).toBe("#10b981");
		expect(miniMapColorForType("condition")).toBe("#8b5cf6");
	});

	test("returns a hex for every registered catalog type", () => {
		for (const id of ["model", "http_request", "notify", "tool_call"]) {
			expect(miniMapColorForType(id)).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	test("falls back to neutral for unknown/undefined types", () => {
		expect(miniMapColorForType("skill_call:legacy")).toBe("#94a3b8");
		expect(miniMapColorForType(undefined)).toBe("#94a3b8");
	});
});
