import type { SettingsSection } from "renderer/stores/settings-state";

/**
 * Single source of truth for the Settings surface (P0/P1 hardening, #591).
 *
 * The sidebar nav, the section⇆route maps consumed by `layout.tsx`, and the
 * search registry (`settings-search`) used to be three independently
 * hand-maintained lists. They drifted: `voice` was missing from search,
 * `surfaces` was missing from the route map, and section ordering/membership
 * could disagree, breaking search auto-navigation and path resolution.
 *
 * Everything is now derived from this one ordered manifest. Adding a section
 * here makes it appear in the sidebar, the route map and the search-coverage
 * test automatically. `settings-manifest.test.ts` asserts the manifest section
 * set equals the route-map and the search registry, so they can never drift
 * again.
 *
 * Icons (JSX) live in the sibling `settings-manifest-icons.tsx` keyed by
 * section, so this module stays free of the renderer JSX runtime and is
 * importable from plain `bun test` units.
 *
 * `slug` is the URL segment under `/settings/`. `match` (optional) lists extra
 * pathname fragments that resolve to this section (e.g. the `api-keys` route
 * maps to the `apikeys` registry section). `group` is the sidebar heading the
 * item renders under, in declared order.
 */

export type SettingsGroupLabel =
	| "Личное"
	| "Редактор и процесс"
	| "Организация"
	| "Система";

export interface SettingsManifestEntry {
	section: SettingsSection;
	/** URL segment under `/settings/` (e.g. `api-keys`). */
	slug: string;
	/** Sidebar label. */
	label: string;
	/** Sidebar group heading. */
	group: SettingsGroupLabel;
	/** Extra pathname fragments that also resolve to this section. */
	match?: string[];
	/** Only show on macOS. */
	macOnly?: boolean;
}

export const SETTINGS_MANIFEST: SettingsManifestEntry[] = [
	// Личное
	{ section: "account", slug: "account", label: "Аккаунт", group: "Личное" },
	{
		section: "appearance",
		slug: "appearance",
		label: "Внешний вид",
		group: "Личное",
	},
	{
		section: "surfaces",
		slug: "surfaces",
		label: "Поверхности",
		group: "Личное",
	},
	{
		section: "ringtones",
		slug: "ringtones",
		label: "Уведомления",
		group: "Личное",
	},
	// Редактор и процесс
	{
		section: "behavior",
		slug: "behavior",
		label: "Общие",
		group: "Редактор и процесс",
	},
	{
		section: "keyboard",
		slug: "keyboard",
		label: "Клавиатура",
		group: "Редактор и процесс",
	},
	{
		section: "voice",
		slug: "voice",
		label: "Голос",
		group: "Редактор и процесс",
	},
	{
		section: "git",
		slug: "git",
		label: "Git и worktrees",
		group: "Редактор и процесс",
	},
	{
		section: "agents",
		slug: "agents",
		label: "Агенты",
		group: "Редактор и процесс",
	},
	{
		section: "terminal",
		slug: "terminal",
		label: "Терминал",
		group: "Редактор и процесс",
	},
	{
		section: "links",
		slug: "links",
		label: "Ссылки",
		group: "Редактор и процесс",
	},
	{
		section: "shares",
		slug: "shares",
		label: "Публичные ссылки",
		group: "Редактор и процесс",
	},
	{
		section: "models",
		slug: "models",
		label: "Модели",
		group: "Редактор и процесс",
	},
	// Организация
	{
		section: "organization",
		slug: "organization",
		label: "Организация",
		group: "Организация",
	},
	{
		section: "teams",
		slug: "teams",
		label: "Команды",
		group: "Организация",
	},
	{
		section: "project",
		slug: "projects",
		label: "Проекты",
		group: "Организация",
		match: ["/settings/project"],
	},
	{ section: "hosts", slug: "hosts", label: "Хосты", group: "Организация" },
	{
		section: "integrations",
		slug: "integrations",
		label: "Интеграции",
		group: "Организация",
	},
	{
		section: "apikeys",
		slug: "api-keys",
		label: "API-ключи",
		group: "Организация",
	},
	// Система
	{
		section: "security",
		slug: "security",
		label: "Безопасность",
		group: "Система",
	},
	{
		section: "permissions",
		slug: "permissions",
		label: "Разрешения",
		group: "Система",
		macOnly: true,
	},
	{
		section: "experimental",
		slug: "experimental",
		label: "Эксперименты",
		group: "Система",
	},
];

/** Ordered group headings, in the order they first appear in the manifest. */
export const SETTINGS_GROUP_ORDER: SettingsGroupLabel[] = [
	"Личное",
	"Редактор и процесс",
	"Организация",
	"Система",
];

/** Section ids in manifest (= sidebar = route) order. */
export const SECTION_ORDER: SettingsSection[] = SETTINGS_MANIFEST.map(
	(entry) => entry.section,
);

/** Resolve a `/settings/...` pathname to its section, or `null`. */
export function getSectionFromPath(pathname: string): SettingsSection | null {
	for (const entry of SETTINGS_MANIFEST) {
		if (pathname.includes(`/settings/${entry.slug}`)) return entry.section;
		if (entry.match?.some((fragment) => pathname.includes(fragment))) {
			return entry.section;
		}
	}
	return null;
}

/** Resolve a section to its canonical `/settings/<slug>` path. */
export function getPathFromSection(section: SettingsSection): string {
	const entry = SETTINGS_MANIFEST.find((e) => e.section === section);
	return entry ? `/settings/${entry.slug}` : "/settings/account";
}
