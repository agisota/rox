/**
 * Deterministic identity glyph + colour generator (Hermes-borrow F24).
 *
 * Turns any stable id/handle into a consistent visual identity: a hue hashed
 * from the seed, ready-to-use HSL background/foreground colours, uppercase
 * initials from a display name, and a stable geometric variant index. Pure — no
 * DOM, no React, no I/O — so the same `(seed, name)` renders byte-identical on
 * web, desktop, and mobile, and the same hue can back both identity avatars
 * (Identity cluster) and tag auto-colouring (F11). This is a *visual* hash:
 * deliberately stable and collision-tolerant, never cryptographic.
 *
 * Colours use the comma HSL form `hsl(h, s%, l%)` for maximum portability —
 * React Native's colour parser accepts that form, modern CSS accepts both.
 */

/** Number of stable geometric glyph variants {@link glyphVariant} can return. */
export const GLYPH_VARIANT_COUNT = 6;

/** Saturation of generated avatar backgrounds (HSL %). */
const BG_SATURATION = 58;
/** Lightness of generated avatar backgrounds (HSL %) — legible under white text on both themes. */
const BG_LIGHTNESS = 46;

/**
 * 32-bit FNV-1a hash of `seed`, returned as a non-negative integer. Stable
 * across platforms and runs (no `Math.random`, no locale). An empty string
 * hashes to the FNV offset basis, so even an empty seed is deterministic.
 */
export function hashSeed(seed: string): number {
	let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis.
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		// FNV prime 16777619, kept in 32-bit space via Math.imul.
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0; // Coerce to unsigned 32-bit.
}

/** Stable hue `0..359` for `seed`. */
export function hueFromSeed(seed: string): number {
	return hashSeed(seed) % 360;
}

/**
 * Stable geometric glyph variant `0..GLYPH_VARIANT_COUNT-1` for `seed`. Offset
 * from the colour hash so the variant does not correlate 1:1 with the hue.
 */
export function glyphVariant(seed: string): number {
	return hashSeed(`${seed}#glyph`) % GLYPH_VARIANT_COUNT;
}

/** Drop leading characters that are neither letters nor digits (emoji, `@`, punctuation). */
function stripLeadingNonAlnum(word: string): string {
	return word.replace(/^[^\p{L}\p{N}]+/u, "");
}

/**
 * Uppercase 1–2 letter initials from a display name. Takes the first letter of
 * the first two whitespace-separated words; for a single word, its first two
 * letters; leading emoji/punctuation are ignored. Returns `"?"` when no usable
 * character exists, so an avatar never renders empty.
 */
export function initialsFrom(displayName: string): string {
	const [first, second] = displayName
		.trim()
		.split(/\s+/)
		.map(stripLeadingNonAlnum)
		.filter((word) => word.length > 0);

	if (first === undefined) {
		return "?";
	}
	if (second === undefined) {
		return first.slice(0, 2).toUpperCase();
	}
	return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export interface IdentityGlyph {
	/** Stable hue `0..359` derived from the seed. */
	hue: number;
	/** Ready-to-use HSL avatar background, e.g. `"hsl(214, 58%, 46%)"`. */
	background: string;
	/** Readable foreground for text/icon on {@link IdentityGlyph.background}. */
	foreground: string;
	/** Uppercase 1–2 char initials from the display name (`"?"` when none). */
	initials: string;
	/** Stable geometric variant `0..GLYPH_VARIANT_COUNT-1` for icon-style glyphs. */
	variant: number;
}

/**
 * Build a deterministic {@link IdentityGlyph} for an identity.
 *
 * @param seed Stable identifier (user id, persona id, handle, tag name…). The
 *   colour is hashed from this, so the same entity is always the same colour
 *   everywhere.
 * @param displayName Human-facing name, used only for {@link initialsFrom}. When
 *   omitted, `seed` is used, so there is always a glyph (never a broken-image
 *   state).
 */
export function identityGlyph(
	seed: string,
	displayName?: string,
): IdentityGlyph {
	const hue = hueFromSeed(seed);
	return {
		hue,
		background: `hsl(${hue}, ${BG_SATURATION}%, ${BG_LIGHTNESS}%)`,
		foreground: "hsl(0, 0%, 100%)",
		initials: initialsFrom(displayName ?? seed),
		variant: glyphVariant(seed),
	};
}
