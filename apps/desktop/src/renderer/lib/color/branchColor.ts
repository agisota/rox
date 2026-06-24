import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";

/**
 * Maps named palette entries (e.g. "Red", "Indigo") to their hex value so
 * either a stored hex (`#ef4444`) or a stored name resolves to a hex string.
 * The context menu persists hex values, but names are accepted for robustness.
 */
const NAMED_COLOR_TO_HEX = new Map<string, string>(
	PROJECT_COLORS.map((color) => [color.name.toLowerCase(), color.value]),
);

/**
 * Converts a hex color to rgba with the specified alpha.
 */
export function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Checks if a color value is a custom hex color (not the "default" value).
 */
export function isCustomColor(color: string): boolean {
	return color !== PROJECT_COLOR_DEFAULT && color.startsWith("#");
}

/**
 * Resolves a stored color value to a hex string, or null when it is the
 * default / unset. Accepts a hex value verbatim or a named palette entry
 * (case-insensitive) such as "Red" or "Indigo".
 */
export function resolveBranchColorHex(
	color: string | null | undefined,
): string | null {
	if (!color || color === PROJECT_COLOR_DEFAULT) return null;
	if (isCustomColor(color)) return color;
	return NAMED_COLOR_TO_HEX.get(color.toLowerCase()) ?? null;
}
