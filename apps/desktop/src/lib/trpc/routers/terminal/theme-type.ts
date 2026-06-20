import type { ThemeState } from "main/lib/app-state/schemas";
import { builtInThemes } from "shared/themes";

type ThemeType = "dark" | "light";

export function resolveTerminalThemeType(params: {
	requestedThemeType?: ThemeType;
	persistedThemeState?: ThemeState;
	systemPrefersDark?: boolean;
}): ThemeType {
	const {
		requestedThemeType,
		persistedThemeState,
		systemPrefersDark = true,
	} = params;

	if (requestedThemeType) {
		return requestedThemeType;
	}

	if (!persistedThemeState) {
		return "dark";
	}

	const { activeThemeId, customThemes } = persistedThemeState;

	if (activeThemeId === "system") {
		return systemPrefersDark ? "dark" : "light";
	}

	// Resolve the active theme by id; an unknown/stale id is not silently
	// promoted to the default theme — it falls through to the safe "dark"
	// terminal fallback (matching the renderer-side resolver).
	const matchingTheme =
		customThemes.find((theme) => theme.id === activeThemeId) ||
		builtInThemes.find((theme) => theme.id === activeThemeId);

	return matchingTheme?.type ?? "dark";
}
