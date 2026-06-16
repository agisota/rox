/**
 * Prompt-import parser — journal-memory epic.
 *
 * Parses the dump another assistant produces from the canonical export prompt:
 * memories grouped under the headers Instructions / Identity / Career / Projects
 * / Preferences, each entry on its own line, optionally prefixed `[YYYY-MM-DD] -`.
 * Maps the five export categories onto the five Rox memory groups and returns a
 * flat list of `{category, body}`. Pure + db-free so it can be unit-tested.
 */

import type { MemoryCategory } from "@rox/db/schema";

/** Export category → Rox group. Preferences fold into instructions. */
const EXPORT_CATEGORY_TO_ROX: Record<string, MemoryCategory> = {
	instructions: "instructions",
	preferences: "instructions",
	identity: "identity",
	career: "career",
	projects: "projects",
};

const CATEGORY_HEADER_RE =
	/^[\s#*>_-]*\**\s*(instructions|identity|career|projects|preferences)\b\s*:?\**\s*$/i;
const DATE_PREFIX_RE = /^\s*[-*•]?\s*\[?\d{4}-\d{2}-\d{2}\]?\s*[-–—:]?\s*/;
const LIST_MARKER_RE = /^\s*[-*•]\s+/;

export interface ParsedMemory {
	category: MemoryCategory;
	body: string;
}

/**
 * Parse a pasted prompt-import dump into `{category, body}` entries. Lines that
 * are category headers switch the active group; entries below the active header
 * are stripped of `[date] -` prefixes and list markers. Text before any
 * recognized header is ignored.
 */
export function parsePromptImport(text: string): ParsedMemory[] {
	const out: ParsedMemory[] = [];
	let current: MemoryCategory | null = null;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const header = line.match(CATEGORY_HEADER_RE);
		if (header) {
			const key = header[1]?.toLowerCase();
			if (key) current = EXPORT_CATEGORY_TO_ROX[key] ?? current;
			continue;
		}
		if (!current) continue;

		let body = line.replace(DATE_PREFIX_RE, "");
		if (body === line) body = body.replace(LIST_MARKER_RE, "");
		body = body.trim();
		if (body.length > 0) out.push({ category: current, body });
	}

	return out;
}
