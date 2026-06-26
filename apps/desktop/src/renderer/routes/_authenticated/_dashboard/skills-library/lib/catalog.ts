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

import {
	CURATED_DEFAULT_SKILL_PACKS,
	CURATED_DEFAULT_SKILLS,
} from "@rox/shared/skills/curated-default-skills";

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
	/** Curated skill directories this pack lands (one per `~/.claude/skills/<n>`). */
	skillNames: readonly string[];
	/** How many of {@link skillNames} are currently present on disk. */
	installedCount: number;
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
 * Map every curated source repo to the flattened skill directory names it
 * installs. The bundled archive lands each curated skill as its own
 * `~/.claude/skills/<name>` directory, so a pack's true install state is "are
 * its constituent skills on disk?" — not "is there a directory named after the
 * pack?" (there never is). Pure, derived from the shared source of truth.
 */
const SKILL_NAMES_BY_REPO: ReadonlyMap<string, readonly string[]> = (() => {
	const map = new Map<string, string[]>();
	for (const skill of CURATED_DEFAULT_SKILLS) {
		const list = map.get(skill.repo) ?? [];
		list.push(skill.name);
		map.set(skill.repo, list);
	}
	return map;
})();

/**
 * Build the catalog view model. A pack counts as "installed" when every curated
 * skill it ships is present on disk (matched against installed slug/name,
 * case-insensitive) — the same identity the bundled catalog uses when it lands
 * `~/.claude/skills/<name>`. Packs whose curated skill list is unknown fall back
 * to a direct name match so they still resolve.
 */
export function buildCatalog(
	installed: ReadonlyArray<InstalledSkillRef>,
): CatalogItem[] {
	const byKey = new Map<string, InstalledSkillRef>();
	for (const skill of installed) {
		byKey.set(normalize(skill.slug), skill);
		byKey.set(normalize(skill.name), skill);
	}

	return CURATED_DEFAULT_SKILL_PACKS.map((pack) => {
		const skillNames = SKILL_NAMES_BY_REPO.get(pack.repo) ?? [];
		const presentRefs = skillNames
			.map((name) => byKey.get(normalize(name)))
			.filter((ref): ref is InstalledSkillRef => ref !== undefined);
		// Fallback for packs with no flattened curated skills: direct name match.
		const directMatch = byKey.get(normalize(pack.name)) ?? null;

		const installedCount = presentRefs.length;
		const allPresent =
			skillNames.length > 0 && installedCount === skillNames.length;
		const installState: CatalogInstallState =
			allPresent || directMatch ? "installed" : "available";
		const installedSkillId = presentRefs[0]?.id ?? directMatch?.id ?? null;

		return {
			id: pack.name,
			name: pack.name,
			repo: pack.repo,
			description: pack.description,
			installState,
			installedSkillId,
			skillNames,
			installedCount,
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
