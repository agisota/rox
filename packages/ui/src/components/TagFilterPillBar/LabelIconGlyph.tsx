"use client";

import { type LabelLucideIcon, parseLabelIcon } from "@rox/shared/label-style";
import {
	Bell,
	Bookmark,
	CircleCheck,
	Flag,
	Flame,
	Folder,
	Heart,
	Inbox,
	type LucideIcon,
	Rocket,
	Star,
	Tag,
	Zap,
} from "lucide-react";

/**
 * Static map from a curated Lucide name to its component (Hermes-borrow F11).
 *
 * Deliberately a fixed lookup, not a dynamic `lucide-react/dynamic` import: the
 * studio offers a small fixed icon set, so a static map keeps the bundle lean,
 * avoids a runtime import boundary, and mirrors the RN renderer (which imports
 * the same handful of glyphs). Keys are exactly `LABEL_LUCIDE_ICONS`; a missing
 * key can never render because `parseLabelIcon` only returns names in that set.
 */
const LUCIDE_GLYPHS: Record<LabelLucideIcon, LucideIcon> = {
	tag: Tag,
	star: Star,
	flag: Flag,
	bookmark: Bookmark,
	flame: Flame,
	rocket: Rocket,
	zap: Zap,
	heart: Heart,
	bell: Bell,
	folder: Folder,
	inbox: Inbox,
	"circle-check": CircleCheck,
};

export interface LabelIconGlyphProps {
	/** The stored icon token (emoji or `lucide:<name>`); `null`/absent renders nothing. */
	icon: string | null | undefined;
	/** Tailwind sizing class for the rendered glyph (Lucide SVG and emoji alike). */
	className?: string;
}

/**
 * Render a label's icon token as the matching glyph: a curated Lucide SVG for a
 * `lucide:<name>` token, the literal emoji for an emoji token, or nothing when
 * unset. The single source of truth for "how a label icon looks", shared by the
 * pill, the studio preview, and the swatch picker so they never drift.
 */
export function LabelIconGlyph({ icon, className }: LabelIconGlyphProps) {
	const parsed = parseLabelIcon(icon);

	if (parsed.kind === "none") {
		return null;
	}

	if (parsed.kind === "emoji") {
		return (
			<span aria-hidden className={className}>
				{parsed.emoji}
			</span>
		);
	}

	const Glyph = LUCIDE_GLYPHS[parsed.name];
	return <Glyph aria-hidden className={className} />;
}
