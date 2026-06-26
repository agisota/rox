import { describe, expect, it } from "bun:test";
import type { SettingsSection } from "renderer/stores/settings-state";
import { SETTINGS_ITEMS } from "../../utils/settings-search/settings-search";
import {
	getPathFromSection,
	getSectionFromPath,
	SECTION_ORDER,
	SETTINGS_GROUP_ORDER,
	SETTINGS_MANIFEST,
} from "./settings-manifest";

function sortedUnique(sections: SettingsSection[]): SettingsSection[] {
	return [...new Set(sections)].sort();
}

describe("settings manifest is the single source of truth", () => {
	const manifestSections = sortedUnique(
		SETTINGS_MANIFEST.map((entry) => entry.section),
	);
	const searchSections = sortedUnique(
		SETTINGS_ITEMS.map((item) => item.section),
	);

	it("sidebar (manifest) section set equals the search registry section set", () => {
		expect(manifestSections).toEqual(searchSections);
	});

	it("every manifest section round-trips through the route map", () => {
		for (const entry of SETTINGS_MANIFEST) {
			const path = getPathFromSection(entry.section);
			expect(path).toBe(`/settings/${entry.slug}`);
			expect(getSectionFromPath(path)).toBe(entry.section);
		}
	});

	it("route map (path → section) covers exactly the manifest sections", () => {
		const routeSections = sortedUnique(
			SETTINGS_MANIFEST.map(
				(entry) =>
					getSectionFromPath(`/settings/${entry.slug}`) as SettingsSection,
			),
		);
		expect(routeSections).toEqual(manifestSections);
	});

	it("has no duplicate sections or slugs", () => {
		const sections = SETTINGS_MANIFEST.map((e) => e.section);
		const slugs = SETTINGS_MANIFEST.map((e) => e.slug);
		expect(sections.length).toBe(new Set(sections).size);
		expect(slugs.length).toBe(new Set(slugs).size);
	});

	it("SECTION_ORDER matches the manifest order", () => {
		expect(SECTION_ORDER).toEqual(SETTINGS_MANIFEST.map((e) => e.section));
	});

	it("every manifest group is one of the declared group headings", () => {
		for (const entry of SETTINGS_MANIFEST) {
			expect(SETTINGS_GROUP_ORDER).toContain(entry.group);
		}
	});

	it("adding a section to the manifest surfaces it in sidebar, route and search", () => {
		// Guards the acceptance criterion: a new section cannot exist in the
		// manifest without a corresponding search registry entry (and vice
		// versa), so nav/route/search stay in lockstep.
		for (const section of manifestSections) {
			expect(searchSections).toContain(section);
		}
		for (const section of searchSections) {
			expect(manifestSections).toContain(section);
		}
	});
});
