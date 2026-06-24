/**
 * CodeMirror 6 theme + language extensions for the Skills library editor.
 *
 * The Rox dark-glass theme is built from the app's own CSS variables
 * (`--background`, `--foreground`, `--primary`, `--border`, …) via
 * `EditorView.theme`, so the editor inherits the active palette instead of
 * shipping a fixed colour set. Victor Mono is the editor font (the app's
 * `font-mono`). Language extensions are resolved lazily by file kind so only
 * the needed CM grammars load.
 *
 * Browser/React-agnostic at the extension level; only the call site needs CM.
 */

import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SkillFileLanguage } from "./file-kind";

/**
 * Rox dark-glass editor chrome. Transparent gutters/background so the editor
 * sits on the surface's glass; selection/cursor/active-line pull from tokens.
 */
export const roxEditorTheme: Extension = EditorView.theme(
	{
		"&": {
			backgroundColor: "transparent",
			color: "var(--foreground)",
			fontSize: "12px",
			height: "100%",
		},
		".cm-scroller": {
			fontFamily: "var(--font-mono, ui-monospace, monospace)",
			lineHeight: "1.6",
			overflow: "auto",
		},
		".cm-content": {
			caretColor: "var(--primary)",
			padding: "12px 4px 48px",
		},
		"&.cm-focused": {
			outline: "none",
		},
		".cm-cursor, .cm-dropCursor": {
			borderLeftColor: "var(--primary)",
		},
		"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
			{
				backgroundColor: "color-mix(in oklab, var(--primary) 26%, transparent)",
			},
		".cm-gutters": {
			backgroundColor: "transparent",
			color: "color-mix(in oklab, var(--muted-foreground) 70%, transparent)",
			border: "none",
		},
		".cm-activeLine": {
			backgroundColor: "color-mix(in oklab, var(--accent) 45%, transparent)",
		},
		".cm-activeLineGutter": {
			backgroundColor: "color-mix(in oklab, var(--accent) 45%, transparent)",
			color: "var(--foreground)",
		},
		".cm-lineNumbers .cm-gutterElement": {
			padding: "0 6px 0 8px",
		},
		".cm-foldPlaceholder": {
			backgroundColor: "var(--muted)",
			border: "none",
			color: "var(--muted-foreground)",
		},
		".cm-selectionMatch": {
			backgroundColor: "color-mix(in oklab, var(--primary) 18%, transparent)",
		},
		".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
			backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
			color: "inherit",
		},
		".cm-placeholder": {
			color: "var(--muted-foreground)",
		},
	},
	{ dark: true },
);

/** Resolve the language extension(s) for a skill file kind. */
export function languageExtension(kind: SkillFileLanguage): Extension[] {
	switch (kind) {
		case "markdown":
			return [markdown({ base: markdownLanguage, codeLanguages: [] })];
		case "yaml":
			return [yaml()];
		case "json":
			return [json()];
		case "javascript":
			return [javascript({ jsx: true, typescript: true })];
		case "shell":
			return [StreamLanguage.define(shell)];
		default:
			return [];
	}
}
