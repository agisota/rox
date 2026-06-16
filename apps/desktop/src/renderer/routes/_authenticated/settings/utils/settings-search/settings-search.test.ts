import { describe, expect, it } from "bun:test";
import {
	SETTING_ITEM_ID,
	SETTINGS_ITEMS,
	type SettingsItem,
	searchSettings,
} from "./settings-search";

function getIds(items: SettingsItem[]): string[] {
	return items.map((item) => item.id);
}

describe("settings search - font settings", () => {
	it('searching "font" returns both APPEARANCE_EDITOR_FONT and APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "terminal font" returns APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("terminal font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "editor" returns APPEARANCE_EDITOR_FONT', () => {
		const results = searchSettings("editor");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it('searching "monospace" returns both font items', () => {
		const results = searchSettings("monospace");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "Editor Font" is case-insensitive', () => {
		const results = searchSettings("Editor Font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it("empty search returns all settings items", () => {
		const results = searchSettings("");
		expect(results.length).toBeGreaterThan(0);
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("font items have correct section", () => {
		const results = searchSettings("font");
		const editorFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		);
		const terminalFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		);

		expect(editorFont?.section).toBe("appearance");
		expect(terminalFont?.section).toBe("appearance");
	});
});

describe("settings search - share settings", () => {
	it('searching "share" returns public share management', () => {
		const results = searchSettings("share");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.PUBLIC_SHARES);
	});
});

describe("settings search - integration settings", () => {
	const integrationItems = [
		{ id: SETTING_ITEM_ID.INTEGRATIONS_LINEAR, query: "Linear" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_GITHUB, query: "GitHub" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_SLACK, query: "Slack" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_TELEGRAM, query: "Telegram" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_DISCORD, query: "Discord" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_NOTION, query: "Notion" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_OBSIDIAN, query: "Obsidian" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_FIBERY, query: "Fibery" },
		{ id: SETTING_ITEM_ID.INTEGRATIONS_LARK, query: "Lark" },
	] as const;

	it("registers every release-train integration provider in settings", () => {
		const ids = getIds(SETTINGS_ITEMS);

		for (const item of integrationItems) {
			expect(ids).toContain(item.id);
		}
	});

	it("finds every integration provider by name", () => {
		for (const item of integrationItems) {
			const ids = getIds(searchSettings(item.query));
			expect(ids).toContain(item.id);
		}
	});
});
