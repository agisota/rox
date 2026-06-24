/**
 * Static constants for the Skills library surface (core, pure).
 */

/** Maps a skill `source` to its friendly install-root label. */
export const SOURCE_LABELS: Record<string, string> = {
	claude: "~/.claude",
	agents: "~/.agents",
};

/** The source roots that can be toggled as filter chips (installed view). */
export const SOURCE_FILTERS = [
	{ value: "claude", label: "~/.claude" },
	{ value: "agents", label: "~/.agents" },
] as const;

export type SourceFilterValue = (typeof SOURCE_FILTERS)[number]["value"];

/** Friendly label for a source, falling back to the raw value. */
export function sourceLabel(source: string): string {
	return SOURCE_LABELS[source] ?? source;
}

/** Catalog install-state filter options (catalog view). */
export const INSTALL_STATE_FILTERS = [
	{ value: "installed", label: "Установлен" },
	{ value: "available", label: "Доступен" },
] as const;

export type InstallStateFilterValue =
	(typeof INSTALL_STATE_FILTERS)[number]["value"];

/** Persisted layout id for the resizable three-zone shell. */
export const SKILLS_LAYOUT_AUTOSAVE_ID = "rox-skills-library-shell";

/** Autosave debounce for the editor, in ms (matches Notes/Automations pattern). */
export const EDITOR_AUTOSAVE_DELAY_MS = 800;
