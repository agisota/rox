import type { SimpleGit } from "simple-git";
import type { BlameAuthor } from "../types";

/**
 * Field separator emitted in the `git log` output. We can't pass a raw control
 * byte inside the `--format` *argument* (Node rejects NUL bytes in argv), so we
 * ask git to emit a 0x1F Unit Separator via the `%x1f` placeholder — the
 * argument string stays plain ASCII, while the parsed output is delimited by a
 * real 0x1F that can never occur in an author name/email or a commit hash.
 */
const FIELD_SEP = "\x1f";

/**
 * `git log -1` blame format: full SHA, author name, author email, author date
 * as a Unix epoch (seconds). Author date (`%at`) — not commit date — matches
 * "who wrote this", and is the relative-time we show in the tree. `%x1f` makes
 * git print the {@link FIELD_SEP} delimiter at runtime.
 */
export const BLAME_LOG_FORMAT = "%H%x1f%an%x1f%ae%x1f%at";

/**
 * Parse one line of {@link BLAME_LOG_FORMAT} output into a {@link BlameAuthor}.
 * Returns `null` for empty/malformed output (e.g. an untracked path with no
 * commit history) so callers can degrade to "no blame yet" rather than throw.
 *
 * Pure and serializable: epoch seconds are normalized to milliseconds here so
 * the wire payload is a plain number, keeping author→identity resolution in
 * shared (`@rox/shared`) and identical on web/desktop/mobile.
 */
export function parseBlameLogLine(raw: string): BlameAuthor | null {
	const line = raw.trim();
	if (!line) return null;
	const [commit, name, email, epochSeconds] = line.split(FIELD_SEP);
	if (!commit || !epochSeconds) return null;
	const seconds = Number.parseInt(epochSeconds, 10);
	if (!Number.isFinite(seconds)) return null;
	return {
		commit,
		name: name ?? "",
		email: email ?? "",
		timestamp: seconds * 1000,
	};
}

/**
 * Resolve the last author who touched `relativePath`, mirroring the per-file
 * "last author" git blame surfaces in the Files tab (F35). Uses a single
 * `git log -1 --follow` spawn — the cheapest way to answer "who last changed
 * this file" (full per-line `blame --porcelain` is unnecessary for a per-file
 * decoration and far slower on large files).
 *
 * `--follow` keeps authorship stable across renames. Returns `null` when the
 * path has no commit history (untracked / newly added) so the tree simply shows
 * no author until the file is committed.
 */
export async function getFileBlameAuthor(
	git: SimpleGit,
	relativePath: string,
): Promise<BlameAuthor | null> {
	const raw = await git.raw([
		"log",
		"-1",
		"--follow",
		`--format=${BLAME_LOG_FORMAT}`,
		"--",
		relativePath,
	]);
	return parseBlameLogLine(raw);
}
