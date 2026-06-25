/**
 * Platform-neutral slash-command model (F45).
 *
 * The desktop slash engine (`@rox/chat`, Electron-local) discovers commands from
 * the filesystem and exposes them over its local tRPC service. Web and mobile do
 * not have that service, so this module defines a platform-neutral menu entry
 * shape plus the source classification used to badge each entry. Both the
 * desktop discovery output and the shared built-in list (see
 * `builtin-slash-commands.ts`) normalize into this shape, so the same menu UI
 * and matcher serve every host.
 *
 * Nothing here imports React, the DOM, Electron, or React Native.
 */

/**
 * Locale-aware label. Slash command metadata can carry per-locale text; the
 * shared matcher and UI resolve it against the active locale, falling back to
 * `en` then to the first available value. Plain strings are accepted too and
 * treated as locale-agnostic.
 */
export type LocalizedText = string | Partial<Record<string, string>>;

/**
 * The badge category shown next to each entry. Mirrors the discovery sources of
 * the desktop engine (built-in vs custom markdown commands) and adds the
 * sub-argument, agent, plugin and skill distinctions surfaced in the menu:
 *  - `builtin`  — a first-party built-in command (e.g. `/review`, `/plan`).
 *  - `sub-arg`  — a built-in that opens a sub-argument picker (`/model`,
 *                 `/theme`): selecting it does not send, it refines arguments.
 *  - `agent`    — a custom command sourced from an agent definition.
 *  - `plugin`   — a custom command contributed by a plugin.
 *  - `skill`    — a custom command contributed by a skill.
 *  - `command`  — a generic custom markdown command with no finer provenance.
 */
export type SlashMenuEntrySource =
	| "builtin"
	| "sub-arg"
	| "agent"
	| "plugin"
	| "skill"
	| "command";

/** A single slash-menu entry, normalized across hosts. */
export interface SlashMenuEntry {
	/** Canonical command name without the leading slash (e.g. "review"). */
	name: string;
	/** Alternate names that also resolve to this command. */
	aliases: string[];
	/** Human description, optionally locale-aware. */
	description: LocalizedText;
	/** Frontmatter `argument-hint` shown after the name (e.g. "[<scope>]"). */
	argumentHint: string;
	/** Badge category used for both rendering and ordering. */
	source: SlashMenuEntrySource;
	/**
	 * `allowed-tools` frontmatter, parsed-but-ignored by the engine and surfaced
	 * here as read-only metadata only.
	 */
	allowedTools?: string[];
}

/**
 * The provenance fields the desktop engine exposes per command. Kept structural
 * (not importing `@rox/chat`) so this neutral module never depends on the
 * desktop package.
 */
export interface SlashCommandProvenance {
	kind: "builtin" | "custom";
	/** `builtin` | `project` | `global` on the engine side. */
	source?: string;
	/** Present on built-ins that open a sub-argument picker. */
	action?: { type?: string } | null;
}

/** Built-in action types that open a sub-argument picker rather than sending. */
const SUB_ARGUMENT_ACTION_TYPES = new Set(["set_model", "set_theme"]);

/**
 * Classify a command's provenance into a menu badge category. Built-ins whose
 * action opens a picker (`/model`, `/theme`) are badged `sub-arg`; other
 * built-ins are `builtin`. Custom commands are badged by their `source` token
 * (`agent`/`plugin`/`skill`) when the engine provides one, else `command`.
 */
export function classifySlashCommandSource(
	provenance: SlashCommandProvenance,
): SlashMenuEntrySource {
	if (provenance.kind === "builtin") {
		const actionType = provenance.action?.type;
		if (actionType && SUB_ARGUMENT_ACTION_TYPES.has(actionType)) {
			return "sub-arg";
		}
		return "builtin";
	}

	switch (provenance.source) {
		case "agent":
			return "agent";
		case "plugin":
			return "plugin";
		case "skill":
			return "skill";
		default:
			return "command";
	}
}

/**
 * Resolve a {@link LocalizedText} against a locale. Falls back to `en`, then to
 * the first available value. Plain strings are returned as-is.
 */
export function resolveLocalizedText(
	text: LocalizedText,
	locale: string,
): string {
	if (typeof text === "string") return text;
	const exact = text[locale];
	if (exact !== undefined) return exact;
	const short = locale.split("-")[0];
	if (short && text[short] !== undefined) return text[short] as string;
	if (text.en !== undefined) return text.en;
	const first = Object.values(text).find((value) => value !== undefined);
	return first ?? "";
}

/** Order used to group entries by badge category (built-ins first). */
const SOURCE_RANK: Record<SlashMenuEntrySource, number> = {
	command: 0,
	agent: 1,
	plugin: 2,
	skill: 3,
	builtin: 4,
	"sub-arg": 5,
};

/** Sort key for an entry's badge category. Lower sorts first. */
export function slashSourceRank(source: SlashMenuEntrySource): number {
	return SOURCE_RANK[source];
}
