/**
 * Desktop CSS-variable theming.
 *
 * Lifted to the shared `@rox/ui/theme` model (F08 — Theme × Skin two-axis): the
 * key→CSS-var map and the appliers now live once in `@rox/ui` and are shared by
 * web + desktop. Re-exported here so the existing desktop import surface
 * (`./utils/css-variables`) stays stable with no duplicated theme logic.
 */
export {
	applyUIColors,
	clearThemeVariables,
	UI_COLOR_TO_CSS_VAR,
	updateThemeClass,
} from "@rox/ui/theme";
