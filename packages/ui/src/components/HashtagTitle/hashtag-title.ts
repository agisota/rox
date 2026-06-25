/**
 * Pure derivation for the `#tag`-in-title chips (Hermes-borrow F13). No DOM, no
 * React, no I/O — so the same `(title)` derives byte-identical parts on web,
 * desktop, and mobile, and the colour/keying is unit-testable without a
 * renderer.
 *
 * The `#tag` *tokenisation* lives once in `@rox/chat/shared`
 * (`parseHashtagSegments`); this module only adds the presentational concerns
 * the renderer needs — a stable React key per part and a deterministic chip
 * colour hashed from the tag name. The colour comes from the F11/F24 identity
 * hash, so a `#tag` chip and a same-named org-label dot land on the same hue.
 *
 * Tags here are purely presentational: deriving a chip never creates an org
 * label (`chat_sessions.labels`). They are a second, zero-config tag axis layered
 * on top of free-text titles, orthogonal to the F10 label axis.
 */

import { identityGlyph } from "@rox/shared/identity-glyph";

/**
 * The structural shape of a parsed title run, mirroring
 * `@rox/chat/shared`'s `HashtagSegment`. Declared structurally so `@rox/ui`
 * renders chips without depending on the chat package's server stack — the host
 * (which already owns the chat client) parses and passes the segments in.
 */
export type HashtagTitleSegment =
	| { kind: "text"; text: string }
	| { kind: "tag"; text: string; tag: string };

/** A plain (non-tag) part of a title — rendered as verbatim text. */
export interface HashtagTitleTextPart {
	kind: "text";
	/** Stable React key. */
	key: string;
	/** The literal text run. */
	text: string;
}

/** A `#tag` part of a title — rendered as a clickable, coloured chip. */
export interface HashtagTitleChipPart {
	kind: "chip";
	/** Stable React key. */
	key: string;
	/** The full chip label including the leading `#` (`"#design"`). */
	text: string;
	/** The canonical tag name without `#` (`"design"`) — the click payload. */
	tag: string;
	/** Deterministic chip colour, hashed from the tag (shared with F11/F24). */
	color: string;
}

/** One ordered part of a derived title: verbatim text or a clickable chip. */
export type HashtagTitlePart = HashtagTitleTextPart | HashtagTitleChipPart;

/** The deterministic chip colour for `tag`, shared with the F11/F24 hash. */
export function hashtagColor(tag: string): string {
	return identityGlyph(tag.toLowerCase()).background;
}

/**
 * Derive the ordered render parts for a parsed title. Each part carries a stable
 * key (the run's index, so duplicate `#tags` keep distinct keys) and chip parts
 * carry the click payload (`tag`) and colour. Pass the output of
 * `parseHashtagSegments(title)` from `@rox/chat/shared`.
 */
export function deriveHashtagTitleParts(
	segments: readonly HashtagTitleSegment[],
): HashtagTitlePart[] {
	return segments.map((segment, index) => {
		if (segment.kind === "tag") {
			return {
				kind: "chip",
				key: `chip:${index}:${segment.tag}`,
				text: segment.text,
				tag: segment.tag,
				color: hashtagColor(segment.tag),
			};
		}
		return {
			kind: "text",
			key: `text:${index}`,
			text: segment.text,
		};
	});
}
