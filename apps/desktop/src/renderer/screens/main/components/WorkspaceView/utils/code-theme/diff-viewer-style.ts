import type { CSSProperties } from "react";
import { getEditorTheme, type Theme } from "shared/themes";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "../../components/CodeEditor/constants";

interface CodeThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
	/**
	 * Opacity (0..1) applied to the diff surface background so the glass
	 * wallpaper can show through. Defaults to 1 (fully solid). Values < 1 turn
	 * the background hex into an `rgba()` for both the wrapper and the
	 * `@pierre/diffs` context-line background.
	 */
	backgroundOpacity?: number;
}

/**
 * Convert a `#rrggbb` / `#rgb` hex color into an `rgba()` string with the given
 * alpha. Non-hex inputs (already-rgba, css vars, named colors) are returned
 * unchanged so callers stay safe across theme formats.
 */
function withAlpha(color: string, alpha: number): string {
	const hex = color.trim();
	const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
	if (!match) return color;

	let body = match[1];
	if (body.length === 3) {
		body = body
			.split("")
			.map((c) => c + c)
			.join("");
	}
	const r = Number.parseInt(body.slice(0, 2), 16);
	const g = Number.parseInt(body.slice(2, 4), 16);
	const b = Number.parseInt(body.slice(4, 6), 16);
	const a = Math.min(1, Math.max(0, alpha));
	return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function getDiffViewerStyle(
	theme: Theme,
	fontSettings: CodeThemeFontSettings,
): CSSProperties {
	const fontFamily = fontSettings.fontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY;
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);
	const editorTheme = getEditorTheme(theme);

	const opacity =
		typeof fontSettings.backgroundOpacity === "number"
			? Math.min(1, Math.max(0, fontSettings.backgroundOpacity))
			: 1;
	const isGlass = opacity < 1;
	const surfaceBackground = isGlass
		? withAlpha(editorTheme.colors.background, opacity)
		: editorTheme.colors.background;

	return {
		"--diffs-font-family": fontFamily,
		"--diffs-font-size": `${fontSize}px`,
		"--diffs-line-height": `${lineHeight}px`,
		"--diffs-bg-buffer-override": editorTheme.colors.diffBuffer,
		"--diffs-bg-hover-override": editorTheme.colors.diffHover,
		"--diffs-bg-context-override": surfaceBackground,
		"--diffs-bg-separator-override": editorTheme.colors.diffSeparator,
		"--diffs-fg-number-override": editorTheme.colors.gutterForeground,
		"--diffs-addition-color-override": editorTheme.colors.addition,
		"--diffs-deletion-color-override": editorTheme.colors.deletion,
		"--diffs-modified-color-override": editorTheme.colors.modified,
		"--diffs-selection-color-override": editorTheme.colors.selection,
		backgroundColor: surfaceBackground,
		color: editorTheme.colors.foreground,
	} as CSSProperties;
}
