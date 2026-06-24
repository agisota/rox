/**
 * Skills catalog model (core, pure) — Skills library "Каталог" tab.
 *
 * Adapts the single source of truth `CURATED_DEFAULT_SKILL_PACKS`
 * (`@rox/shared`, one row per GitHub repo, RU descriptions) into the view model
 * the catalog grid renders, and derives each pack's install state by matching
 * against the locally installed skills (`skillsLibrary.list`).
 *
 * Reusable by the web twin: it consumes the same shared catalog types, so a web
 * build can render identical cards from the same data.
 */

import { CURATED_DEFAULT_SKILL_PACKS } from "@rox/shared/skills/curated-default-skills";

/** Whether a curated pack is already present on disk. */
export type CatalogInstallState = "installed" | "available";

export interface CatalogItem {
	/** Stable id (the pack slug). */
	id: string;
	/** Display name / install slug. */
	name: string;
	/** Source GitHub repo, e.g. `github.com/obra/superpowers`. */
	repo: string;
	/** RU description. */
	description: string;
	/** Derived from the installed-skills set. */
	installState: CatalogInstallState;
	/** When installed, the matching installed-skill id so we can jump to detail. */
	installedSkillId: string | null;
}

/** Minimal shape of an installed skill needed to derive install state. */
export interface InstalledSkillRef {
	id: string;
	slug: string;
	name: string;
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Build the catalog view model. A pack counts as "installed" when an installed
 * skill shares its slug or name (case-insensitive) — the same identity
 * `seedWorkspaceSkills` uses when it lands `~/.claude/skills/<name>`.
 */
export function buildCatalog(
	installed: ReadonlyArray<InstalledSkillRef>,
): CatalogItem[] {
	const bySlug = new Map<string, InstalledSkillRef>();
	for (const skill of installed) {
		bySlug.set(normalize(skill.slug), skill);
		bySlug.set(normalize(skill.name), skill);
	}

	return CURATED_DEFAULT_SKILL_PACKS.map((pack) => {
		const match = bySlug.get(normalize(pack.name));
		return {
			id: pack.name,
			name: pack.name,
			repo: pack.repo,
			description: pack.description,
			installState: match ? "installed" : "available",
			installedSkillId: match ? match.id : null,
		} satisfies CatalogItem;
	});
}

/** Count installed packs (for the tab counter). */
export function countInstalled(items: ReadonlyArray<CatalogItem>): number {
	return items.reduce(
		(total, item) => total + (item.installState === "installed" ? 1 : 0),
		0,
	);
}

/** Build an `https://` URL from a `github.com/owner/repo` reference. */
export function repoUrl(repo: string): string {
	return repo.startsWith("http") ? repo : `https://${repo}`;
}
