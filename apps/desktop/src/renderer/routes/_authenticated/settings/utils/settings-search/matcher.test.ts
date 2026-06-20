import { describe, expect, it } from "bun:test";
import { matchSettings } from "./matcher";
import {
	SETTING_ITEM_ID,
	SETTINGS_ITEMS,
	type SettingsItem,
} from "./settings-search";

function ids(items: SettingsItem[]): string[] {
	return items.map((item) => item.id);
}

const fixtures: SettingsItem[] = [
	{
		id: SETTING_ITEM_ID.APPEARANCE_THEME,
		section: "appearance",
		title: "Theme",
		description: "Choose your color theme",
		keywords: ["dark", "light", "colors"],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		section: "appearance",
		title: "Editor Font",
		description: "Font used in editors",
		keywords: ["mono", "monospace", "typography"],
	},
	{
		id: SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
		section: "git",
		title: "Branch Prefix",
		description: "Default prefix for branches",
		keywords: ["git", "branch"],
	},
];

describe("matchSettings - empty query", () => {
	it("returns all items for an empty string", () => {
		const result = matchSettings("", fixtures);
		expect(ids(result)).toEqual(ids(fixtures));
	});

	it("returns all items for a whitespace-only query", () => {
		const result = matchSettings("   ", fixtures);
		expect(ids(result)).toEqual(ids(fixtures));
	});

	it("returns a new array, not the original reference", () => {
		const result = matchSettings("", fixtures);
		expect(result).not.toBe(fixtures);
		expect(result).toEqual(fixtures);
	});
});

describe("matchSettings - matching modes", () => {
	it("matches on title (exact)", () => {
		const result = matchSettings("Theme", fixtures);
		expect(ids(result)).toEqual([SETTING_ITEM_ID.APPEARANCE_THEME]);
	});

	it("matches on title (substring)", () => {
		const result = matchSettings("ranch", fixtures);
		expect(ids(result)).toEqual([SETTING_ITEM_ID.GIT_BRANCH_PREFIX]);
	});

	it("matches on description substring", () => {
		const result = matchSettings("color theme", fixtures);
		expect(ids(result)).toEqual([SETTING_ITEM_ID.APPEARANCE_THEME]);
	});

	it("matches on a keyword", () => {
		const result = matchSettings("monospace", fixtures);
		expect(ids(result)).toEqual([SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT]);
	});

	it("returns multiple items when several match", () => {
		// "font" hits the editor title; "Editor Font" + keyword "mono" etc.
		const result = matchSettings("font", fixtures);
		expect(ids(result)).toEqual([SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT]);
	});
});

describe("matchSettings - no match", () => {
	it("returns an empty array when nothing matches", () => {
		const result = matchSettings("zzzznotpresent", fixtures);
		expect(result).toEqual([]);
	});
});

describe("matchSettings - case insensitivity", () => {
	it("uppercase query matches lowercase content", () => {
		expect(ids(matchSettings("THEME", fixtures))).toEqual([
			SETTING_ITEM_ID.APPEARANCE_THEME,
		]);
	});

	it("mixed-case query matches keywords", () => {
		expect(ids(matchSettings("MonoSpace", fixtures))).toEqual([
			SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		]);
	});
});

describe("matchSettings - order preservation", () => {
	it("preserves the input order of matched items", () => {
		// "a" appears in many fields across all three fixtures.
		const result = matchSettings("a", fixtures);
		const matchedInInputOrder = fixtures
			.filter((item) => ids(result).includes(item.id))
			.map((item) => item.id);
		expect(ids(result)).toEqual(matchedInInputOrder);
	});
});

describe("matchSettings - against the real settings index", () => {
	it("empty query yields the full index in order", () => {
		const result = matchSettings("", SETTINGS_ITEMS);
		expect(ids(result)).toEqual(ids(SETTINGS_ITEMS));
	});

	it('"font" matches both font settings', () => {
		const result = ids(matchSettings("font", SETTINGS_ITEMS));
		expect(result).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(result).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("is case-insensitive against the real index", () => {
		const lower = ids(matchSettings("editor font", SETTINGS_ITEMS));
		const upper = ids(matchSettings("EDITOR FONT", SETTINGS_ITEMS));
		expect(upper).toEqual(lower);
		expect(lower).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it("returns no matches for an absent token", () => {
		expect(matchSettings("zzzznotpresent", SETTINGS_ITEMS)).toEqual([]);
	});
});
