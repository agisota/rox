import { describe, expect, it } from "bun:test";
import { getBuiltinSlashMenuEntries } from "./builtin-slash-commands";
import {
	classifySlashCommandSource,
	resolveLocalizedText,
	type SlashMenuEntry,
} from "./slash-command-source";
import { filterSlashMenu, getSlashMenuQuery } from "./slash-menu";

const entry = (over: Partial<SlashMenuEntry>): SlashMenuEntry => ({
	name: "cmd",
	aliases: [],
	description: "",
	argumentHint: "",
	source: "command",
	...over,
});

describe("getSlashMenuQuery", () => {
	it("returns the token after a leading slash", () => {
		expect(getSlashMenuQuery("/")).toBe("");
		expect(getSlashMenuQuery("/rev")).toBe("rev");
	});

	it("returns null when not a single-line slash token", () => {
		expect(getSlashMenuQuery("hello")).toBeNull();
		expect(getSlashMenuQuery("/rev arg")).toBeNull();
		expect(getSlashMenuQuery("/rev\n")).toBeNull();
		expect(getSlashMenuQuery(" /rev")).toBeNull();
	});
});

describe("filterSlashMenu", () => {
	it("lists every entry for an empty query", () => {
		const entries = [entry({ name: "plan" }), entry({ name: "test" })];
		expect(filterSlashMenu(entries, "")).toHaveLength(2);
	});

	it("matches by name and alias", () => {
		const entries = [
			entry({ name: "new", aliases: ["clear"] }),
			entry({ name: "review" }),
		];
		const byAlias = filterSlashMenu(entries, "clear");
		expect(byAlias.map((m) => m.entry.name)).toEqual(["new"]);
		const byName = filterSlashMenu(entries, "rev");
		expect(byName.map((m) => m.entry.name)).toEqual(["review"]);
	});

	it("groups custom entries before built-ins", () => {
		const entries = [
			entry({ name: "model", source: "sub-arg" }),
			entry({ name: "deploy", source: "agent" }),
			entry({ name: "review", source: "builtin" }),
		];
		const ranked = filterSlashMenu(entries, "");
		expect(ranked.map((m) => m.entry.name)).toEqual([
			"deploy",
			"review",
			"model",
		]);
	});

	it("prefers a name match over an alias match at equal score", () => {
		const entries = [
			entry({ name: "run", aliases: ["go"] }),
			entry({ name: "go" }),
		];
		const ranked = filterSlashMenu(entries, "go");
		expect(ranked[0]?.entry.name).toBe("go");
	});
});

describe("classifySlashCommandSource", () => {
	it("badges built-ins and their sub-argument pickers", () => {
		expect(classifySlashCommandSource({ kind: "builtin" })).toBe("builtin");
		expect(
			classifySlashCommandSource({
				kind: "builtin",
				action: { type: "set_model" },
			}),
		).toBe("sub-arg");
		expect(
			classifySlashCommandSource({
				kind: "builtin",
				action: { type: "set_theme" },
			}),
		).toBe("sub-arg");
	});

	it("badges custom commands by provenance source", () => {
		expect(
			classifySlashCommandSource({ kind: "custom", source: "agent" }),
		).toBe("agent");
		expect(
			classifySlashCommandSource({ kind: "custom", source: "plugin" }),
		).toBe("plugin");
		expect(
			classifySlashCommandSource({ kind: "custom", source: "skill" }),
		).toBe("skill");
		expect(
			classifySlashCommandSource({ kind: "custom", source: "project" }),
		).toBe("command");
	});
});

describe("resolveLocalizedText", () => {
	it("resolves locale with en fallback", () => {
		const text = { en: "Plan", ru: "План" };
		expect(resolveLocalizedText(text, "ru")).toBe("План");
		expect(resolveLocalizedText(text, "ru-RU")).toBe("План");
		expect(resolveLocalizedText(text, "fr")).toBe("Plan");
	});

	it("passes plain strings through", () => {
		expect(resolveLocalizedText("Plan", "ru")).toBe("Plan");
	});
});

describe("getBuiltinSlashMenuEntries", () => {
	it("returns fresh, isolated copies", () => {
		const a = getBuiltinSlashMenuEntries();
		const b = getBuiltinSlashMenuEntries();
		expect(a).not.toBe(b);
		a[0]?.aliases.push("mutated");
		expect(b[0]?.aliases).not.toContain("mutated");
	});

	it("includes the shared built-ins with locale-aware descriptions", () => {
		const names = getBuiltinSlashMenuEntries().map((e) => e.name);
		expect(names).toContain("review");
		expect(names).toContain("model");
		expect(names).toContain("theme");
	});
});
