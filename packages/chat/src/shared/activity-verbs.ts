/**
 * F39 — Activity worklog verb taxonomy + summary mapper (single source of
 * truth).
 *
 * Pure, framework-agnostic TypeScript: consumed by the desktop inline renderer
 * (`MessagePartsRenderer`), the shared `ActivityWorklog` UI component, and the
 * React Native adapter alike. No React, no Electron, no DOM — so web, desktop,
 * and mobile reuse the exact same bucketing logic.
 *
 * Tool names are expected to be already normalized (see desktop
 * `normalizeToolName`) to the canonical `mastra_workspace_*` / bare tool ids.
 */

/**
 * Intent buckets a tool call can land in. Drives both the icon family and the
 * tense + count label. `other` is the catch-all so every tool maps somewhere.
 */
export type ActivityVerb =
	| "shell"
	| "read"
	| "search"
	| "write"
	| "skill"
	| "web"
	| "other";

/** Whether the underlying tool call is still running or has settled. */
export type ActivityTense = "present" | "past";

/**
 * Localized labels for one verb bucket. Until F58 i18n lands, RU strings are
 * routed through THIS single constant (`ACTIVITY_VERB_LABELS`) instead of being
 * scattered as inline literals — one swap point for localization.
 */
export interface ActivityVerbLabel {
	/** Streaming/in-flight label, e.g. "Чтение". */
	present: string;
	/** Settled label, e.g. "Прочитано". */
	past: string;
	/** Singular noun for the count, e.g. "файл". */
	noun: string;
	/** Plural noun for the count, e.g. "файлов". */
	nounPlural: string;
}

/**
 * The single localization swap point for F39. Replace this table's values (or
 * source them from F58 i18n) without touching any call site.
 */
export const ACTIVITY_VERB_LABELS: Record<ActivityVerb, ActivityVerbLabel> = {
	shell: {
		present: "Выполнение",
		past: "Выполнено",
		noun: "команда",
		nounPlural: "команд",
	},
	read: {
		present: "Чтение",
		past: "Прочитано",
		noun: "файл",
		nounPlural: "файлов",
	},
	search: {
		present: "Поиск",
		past: "Найдено",
		noun: "запрос",
		nounPlural: "запросов",
	},
	write: {
		present: "Запись",
		past: "Записано",
		noun: "правка",
		nounPlural: "правок",
	},
	skill: {
		present: "Навык",
		past: "Навыки",
		noun: "навык",
		nounPlural: "навыков",
	},
	web: {
		present: "Веб",
		past: "Веб",
		noun: "запрос",
		nounPlural: "запросов",
	},
	other: {
		present: "Действие",
		past: "Действия",
		noun: "действие",
		nounPlural: "действий",
	},
};

/**
 * Maps a normalized tool name to its verb bucket. Covers read AND write/exec
 * tools (the legacy inline switch only labeled read-only tools).
 */
export function mapToolToVerb(toolName: string): ActivityVerb {
	const name = toolName.toLowerCase();

	// Shell / command execution.
	if (
		name.includes("execute_command") ||
		name.includes("run_command") ||
		name.includes("terminal") ||
		name === "bash"
	) {
		return "shell";
	}

	// Write / edit / mutate the workspace.
	if (
		name.includes("write_file") ||
		name.includes("edit_file") ||
		name.includes("smart_edit") ||
		name.includes("string_replace") ||
		name.includes("mkdir") ||
		name.includes("delete")
	) {
		return "write";
	}

	// Web fetch / browse. Checked before `search` so `web_search` (which
	// contains "search") buckets as web, not search.
	if (
		name.includes("web_fetch") ||
		name.includes("web_search") ||
		name === "fetch"
	) {
		return "web";
	}

	// Search / index / grep.
	if (
		name.includes("search") ||
		name.includes("index") ||
		name.includes("grep")
	) {
		return "search";
	}

	// Read / list / stat / inspect.
	if (
		name.includes("read_file") ||
		name.includes("list_files") ||
		name.includes("file_stat") ||
		name.includes("lsp_inspect")
	) {
		return "read";
	}

	// Skill / task orchestration.
	if (
		name.includes("skill") ||
		name.includes("task_write") ||
		name.includes("task_check") ||
		name.includes("submit_plan")
	) {
		return "skill";
	}

	return "other";
}

/** Returns the localized label entry for a verb. */
export function getActivityVerbLabel(verb: ActivityVerb): ActivityVerbLabel {
	return ACTIVITY_VERB_LABELS[verb];
}

/**
 * Builds the human "tense + count" summary for a bucket, e.g.
 * `Прочитано · 3 файла` (past) or `Чтение · 1 файл` (present, streaming).
 *
 * Russian count agreement is approximated with the standard 1 / 2–4 / else
 * buckets so the noun reads naturally for the common cases.
 */
export function formatActivitySummary({
	verb,
	count,
	tense,
}: {
	verb: ActivityVerb;
	count: number;
	tense: ActivityTense;
}): string {
	const label = ACTIVITY_VERB_LABELS[verb];
	const word = tense === "present" ? label.present : label.past;
	const noun = pluralizeRu(count, label.noun, label.nounPlural);
	return `${word} · ${count} ${noun}`;
}

/**
 * Minimal Russian plural agreement: 1 → singular, 2–4 → a "few" form, else →
 * many. We only carry singular + plural label forms, so 2–4 reuses the plural
 * (acceptable for the short activity summary and trivially swappable by F58).
 */
function pluralizeRu(count: number, singular: string, plural: string): string {
	const mod100 = count % 100;
	const mod10 = count % 10;
	if (mod10 === 1 && mod100 !== 11) return singular;
	return plural;
}
