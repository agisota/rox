import { ThemePreviewCard } from "@rox/ui/theme-preview-card";
import { getTerminalColors, type Theme } from "shared/themes";

interface ThemePreviewProps {
	theme: Theme;
	className?: string;
}

/**
 * Live preview of a theme (themes-fonts epic) — renders sample terminal chrome
 * and a palette swatch row using the theme's own colors. Wraps the shared
 * `@rox/ui` ThemePreviewCard and maps Rox theme tokens onto it.
 */
export function ThemePreview({ theme, className }: ThemePreviewProps) {
	const terminal = getTerminalColors(theme);
	const palette = [
		terminal.red,
		terminal.green,
		terminal.yellow,
		terminal.blue,
		terminal.magenta,
		terminal.cyan,
	];

	return (
		<ThemePreviewCard
			className={className}
			name={theme.name}
			subtitle={theme.author ?? (theme.type === "dark" ? "Dark" : "Light")}
			backgroundColor={terminal.background}
			foregroundColor={terminal.foreground}
			promptColor={theme.ui.primary}
			infoColor={terminal.brightBlack}
			readyColor={terminal.green}
			palette={palette}
		/>
	);
}
