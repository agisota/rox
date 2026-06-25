import type { UIColors } from "./colors";
import { getSkin, type Skin } from "./skins";

/**
 * Mobile adapter for the shared Theme × Skin model (F08).
 *
 * React Native cannot consume CSS custom properties, so instead of applying a
 * skin to the document root it needs a *resolved* token struct. These helpers
 * turn a skin (or skin id) into plain string maps the RN side spreads into its
 * own style structs — keeping the Theme/Skin source of truth in `@rox/ui`
 * while leaving the RN imports (`StyleSheet`, navigation `Theme`) on the mobile
 * app where they belong.
 *
 * Only the skin's explicitly-set tokens are returned; the mobile app layers them
 * over its base `THEME[light|dark]` ramp, mirroring how the web layers skin
 * overrides over the globals.css base.
 */

/** Subset of UI tokens the mobile app currently renders. */
export type MobileStyleTokens = Partial<
	Pick<
		UIColors,
		| "background"
		| "foreground"
		| "card"
		| "primary"
		| "primaryForeground"
		| "accent"
		| "border"
		| "ring"
		| "destructive"
	>
>;

/** Resolve a skin (by object or id) to the mobile style-token subset. */
export function skinToStyleTokens(skin: Skin | string): MobileStyleTokens {
	const resolved = typeof skin === "string" ? getSkin(skin) : skin;
	const ui = resolved.ui;
	const tokens: MobileStyleTokens = {};
	const keys: Array<keyof MobileStyleTokens> = [
		"background",
		"foreground",
		"card",
		"primary",
		"primaryForeground",
		"accent",
		"border",
		"ring",
		"destructive",
	];
	for (const key of keys) {
		const value = ui[key];
		if (value) tokens[key] = value;
	}
	return tokens;
}

/** Tokens consumed by React Navigation's `Theme.colors`. */
export interface MobileNavTokens {
	background?: string;
	border?: string;
	card?: string;
	notification?: string;
	primary?: string;
	text?: string;
}

/** Resolve a skin to the React-Navigation color subset. */
export function skinToNavTokens(skin: Skin | string): MobileNavTokens {
	const t = skinToStyleTokens(skin);
	const nav: MobileNavTokens = {};
	if (t.background) nav.background = t.background;
	if (t.border) nav.border = t.border;
	if (t.card) nav.card = t.card;
	if (t.destructive) nav.notification = t.destructive;
	if (t.primary) nav.primary = t.primary;
	if (t.foreground) nav.text = t.foreground;
	return nav;
}
