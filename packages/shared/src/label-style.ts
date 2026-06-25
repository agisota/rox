/**
 * Shared label colour/icon vocabulary for the org chat-label studio
 * (Hermes-borrow F11). Pure — no DOM, no React, no I/O — so the swatch palette,
 * the round-robin auto-colour, and the icon-token parsing are byte-identical on
 * web, desktop, and mobile, and the colour a tag shows is the same everywhere.
 *
 * A label's stored presentation is `(color, icon)`:
 *   - `color` is a ready-to-use CSS/RN colour string (an HSL swatch from
 *     {@link LABEL_SWATCHES} or the deterministic auto-colour from F24's
 *     `identityGlyph`).
 *   - `icon` is an optional token: either a single emoji (`"🚀"`) or a
 *     namespaced Lucide name (`"lucide:rocket"`). {@link parseLabelIcon} turns
 *     the stored token into a tagged variant the renderer can switch on without
 *     re-deriving anything platform-specific.
 *
 * Tags ⟂ identity: this is the organization axis only (colour + icon), never the
 * persona/org (who/where) axis.
 */

import { identityGlyph } from "./identity-glyph";

/**
 * The fixed 8-swatch studio palette. Evenly-spaced hues at the same saturation
 * and lightness as `identityGlyph` backgrounds, so a hand-picked swatch sits in
 * the same visual family as an auto-coloured tag. HSL comma form for RN/CSS
 * portability. Order is stable: it is both the swatch row and the round-robin
 * cycle for new labels.
 */
export const LABEL_SWATCHES = [
	"hsl(214, 58%, 46%)", // blue
	"hsl(160, 58%, 46%)", // teal
	"hsl(122, 58%, 46%)", // green
	"hsl(45, 58%, 46%)", // amber
	"hsl(25, 58%, 46%)", // orange
	"hsl(0, 58%, 46%)", // red
	"hsl(330, 58%, 46%)", // pink
	"hsl(270, 58%, 46%)", // violet
] as const;

/** Number of swatches in {@link LABEL_SWATCHES} (the round-robin period). */
export const LABEL_SWATCH_COUNT = LABEL_SWATCHES.length;

/**
 * The round-robin auto-colour for the `n`-th label created in an org: cycles
 * through {@link LABEL_SWATCHES} so a fresh palette spreads evenly before it
 * repeats. `existingCount` is how many labels already exist (0 → first swatch).
 * Negative inputs are clamped to 0 so the index is always in range.
 */
export function roundRobinSwatch(existingCount: number): string {
	const index = Math.max(0, Math.trunc(existingCount)) % LABEL_SWATCH_COUNT;
	// `index` is always `0..LABEL_SWATCH_COUNT-1`; the `?? [0]` only satisfies the
	// strict-index types and can never actually fall through.
	return LABEL_SWATCHES[index] ?? LABEL_SWATCHES[0];
}

/**
 * Resolve a label's effective colour for rendering: an explicit `color` wins,
 * otherwise the deterministic name-hashed auto-colour (shared with identity
 * avatars, F24). Always returns a usable colour so a pill never renders blank.
 */
export function resolveLabelColor(
	color: string | null | undefined,
	name: string,
): string {
	return color ?? identityGlyph(name).background;
}

/**
 * A curated set of Lucide icon names offered in the studio. Kept as a fixed list
 * (not the whole Lucide set) so the picker is small, the bundle stays lean, and
 * the platform renderer can map each name to a statically-imported component
 * without a dynamic import (RN-safe). Stored as `lucide:<name>`.
 */
export const LABEL_LUCIDE_ICONS = [
	"tag",
	"star",
	"flag",
	"bookmark",
	"flame",
	"rocket",
	"zap",
	"heart",
	"bell",
	"folder",
	"inbox",
	"circle-check",
] as const;

export type LabelLucideIcon = (typeof LABEL_LUCIDE_ICONS)[number];

/**
 * A curated emoji set offered in the studio alongside the Lucide icons. Native
 * emoji render everywhere without an extra dependency; stored verbatim as the
 * icon token. Deliberately small and meaning-agnostic so it pairs with any tag.
 */
export const LABEL_EMOJI = [
	"🏷️",
	"⭐",
	"🚩",
	"🔥",
	"🚀",
	"⚡",
	"❤️",
	"🔔",
	"📁",
	"📌",
	"✅",
	"💡",
] as const;

/** Prefix marking a stored icon token as a curated Lucide name. */
const LUCIDE_PREFIX = "lucide:";

/**
 * A label icon token, parsed into a variant the renderer can switch on:
 *   - `none` — no icon set (the pill shows only its colour dot).
 *   - `lucide` — a curated Lucide name to render as an SVG glyph.
 *   - `emoji` — a literal emoji string to render as text.
 */
export type LabelIcon =
	| { kind: "none" }
	| { kind: "lucide"; name: LabelLucideIcon }
	| { kind: "emoji"; emoji: string };

/** Build the stored token for a curated Lucide icon (`"lucide:rocket"`). */
export function lucideIconToken(name: LabelLucideIcon): string {
	return `${LUCIDE_PREFIX}${name}`;
}

const LUCIDE_ICON_SET: ReadonlySet<string> = new Set(LABEL_LUCIDE_ICONS);

/**
 * Parse a stored icon token into a {@link LabelIcon}. An empty/absent token is
 * `none`; a `lucide:<name>` token with a name still in the curated set is
 * `lucide`; anything else (including a stale Lucide name) is treated as a
 * literal `emoji`, so an unknown token degrades to "render it as text" rather
 * than vanishing.
 */
export function parseLabelIcon(token: string | null | undefined): LabelIcon {
	const trimmed = token?.trim();
	if (!trimmed) {
		return { kind: "none" };
	}
	if (trimmed.startsWith(LUCIDE_PREFIX)) {
		const name = trimmed.slice(LUCIDE_PREFIX.length);
		if (LUCIDE_ICON_SET.has(name)) {
			return { kind: "lucide", name: name as LabelLucideIcon };
		}
	}
	return { kind: "emoji", emoji: trimmed };
}
