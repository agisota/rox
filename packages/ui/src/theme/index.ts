/**
 * Shared Theme × Skin model (F08).
 *
 * The single import surface for the cross-platform theme/skin model:
 * `import { ... } from "@rox/ui/theme"`. Owns the `UIColors` type, the
 * key→CSS-var map, the skin registry, and the appliers shared by web + desktop.
 * The mobile adapter consumes the same `UIColors` shape and `SKINS` registry.
 */

export {
	applySkin,
	applySkinById,
	clearSkin,
} from "./applySkin";
export {
	applyUIColors,
	clearThemeVariables,
	UI_COLOR_TO_CSS_VAR,
	type UIColors,
	updateThemeClass,
} from "./colors";
export {
	skinToNavTokens,
	skinToStyleTokens,
} from "./mobile-adapter";
export {
	DEFAULT_SKIN_ID,
	getSkin,
	SKINS,
	type Skin,
} from "./skins";
