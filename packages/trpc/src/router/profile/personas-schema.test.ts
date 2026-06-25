import { describe, expect, test } from "bun:test";
import { identityGlyph } from "@rox/shared/identity-glyph";
import {
	createPersonaSchema,
	defaultPersonaAccent,
	personaThemeSchema,
	updatePersonaSchema,
} from "./personas-schema";

describe("defaultPersonaAccent (auto-accent default)", () => {
	test("returns the identityGlyph background for the display name", () => {
		expect(defaultPersonaAccent("Atlas")).toBe(
			identityGlyph("Atlas").background,
		);
	});

	test("is deterministic — same name → same accent", () => {
		expect(defaultPersonaAccent("Atlas")).toBe(defaultPersonaAccent("Atlas"));
	});
});

describe("createPersonaSchema", () => {
	test("accepts a minimal persona (name only)", () => {
		expect(createPersonaSchema.parse({ displayName: "Atlas" })).toEqual({
			displayName: "Atlas",
		});
	});

	test("rejects an empty display name", () => {
		expect(() => createPersonaSchema.parse({ displayName: "" })).toThrow();
	});

	test("rejects a handle with invalid characters", () => {
		expect(() =>
			createPersonaSchema.parse({ displayName: "Atlas", handle: "Bad Handle" }),
		).toThrow();
	});

	test("accepts a slug-safe handle and theme", () => {
		const parsed = createPersonaSchema.parse({
			displayName: "Atlas",
			handle: "atlas_1",
			theme: { model: "claude-opus-4", skills: ["search"] },
		});
		expect(parsed.handle).toBe("atlas_1");
		expect(parsed.theme?.model).toBe("claude-opus-4");
	});
});

describe("updatePersonaSchema", () => {
	test("allows clearing handle/avatar with null", () => {
		const parsed = updatePersonaSchema.parse({
			personaId: "00000000-0000-0000-0000-000000000000",
			handle: null,
			avatarUrl: null,
		});
		expect(parsed.handle).toBeNull();
		expect(parsed.avatarUrl).toBeNull();
	});

	test("requires a uuid personaId", () => {
		expect(() => updatePersonaSchema.parse({ personaId: "nope" })).toThrow();
	});
});

describe("personaThemeSchema", () => {
	test("passes through unknown keys (extensible for F22/F23/F29)", () => {
		const parsed = personaThemeSchema.parse({ model: "m", custom: 1 });
		expect((parsed as Record<string, unknown>).custom).toBe(1);
	});
});
