import { identityGlyph } from "@rox/shared/identity-glyph";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import type { BlameAuthor } from "../../hooks/useFileTreeBlame";

export interface BlameDecoration {
	/** Compact lane text: author initials + relative age, e.g. `"AL · 3d"`. */
	text: string;
	/** Hover detail: full name, email, relative age, and short commit. */
	title: string;
}

/**
 * Build the Files-tab row decoration for a file's last author (F35).
 *
 * The decoration lane is text-only (Pierre renders a single right-aligned span),
 * so identity is shown as the same uppercase initials the {@link identityGlyph}
 * avatar uses — seeded on the author *email* so the initials line up with the
 * coloured avatar that lands when FilesTab graduates to `@rox/ui`. Relative time
 * keeps the lane narrow and density-friendly; the full name/email/commit live in
 * the hover `title`.
 */
export function formatBlameDecoration(blame: BlameAuthor): BlameDecoration {
	const { initials } = identityGlyph(blame.email || blame.name, blame.name);
	const age = formatRelativeTime(blame.timestamp);
	const shortCommit = blame.commit.slice(0, 7);
	const who = blame.name || blame.email || "Unknown";
	const emailSuffix = blame.email ? ` <${blame.email}>` : "";
	return {
		text: `${initials} · ${age}`,
		title: `${who}${emailSuffix} · ${age} · ${shortCommit}`,
	};
}
