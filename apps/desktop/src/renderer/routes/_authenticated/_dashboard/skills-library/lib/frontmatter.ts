/**
 * SKILL.md YAML-frontmatter parsing + serialization (Skills library core).
 *
 * Cross-platform, dependency-free substitute for `gray-matter`: the spec calls
 * for two-way sync between a `name`/`description` form and the YAML block, but
 * `gray-matter` is not installed and adding it would touch a shared
 * `package.json`. This module covers EXACTLY the fields the local electron-tRPC
 * router already parses (`name`, `description`) so the form round-trips 1:1 with
 * what `seedWorkspaceSkills` and Claude Code expect under `~/.claude/skills`.
 *
 * Pure logic, React/electron-agnostic — reusable by the web twin
 * (`apps/web/[handle]/skills`) over the same catalog/skill types.
 */

/** The frontmatter fields the Skills library form edits. */
export interface SkillFrontmatter {
	name: string;
	description: string;
}

export interface ParsedSkillDocument {
	/** Parsed frontmatter fields (empty strings when absent). */
	frontmatter: SkillFrontmatter;
	/** Raw YAML block lines (without the `---` fences), preserved for unknown keys. */
	rawFrontmatterLines: string[];
	/** Whether the document actually opened with a `---` fence. */
	hasFrontmatter: boolean;
	/** Markdown body after the closing fence (or the whole doc when no fence). */
	body: string;
	/** Newline style detected in the source, reused on serialization. */
	eol: "\n" | "\r\n";
}

const FENCE = "---";

function detectEol(content: string): "\n" | "\r\n" {
	return content.includes("\r\n") ? "\r\n" : "\n";
}

/** Strip a single layer of matching quotes from a scalar value. */
function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		trimmed.length >= 2 &&
		((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'")))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * Quote a scalar for YAML only when needed (contains a colon, leading/trailing
 * space, or YAML-significant punctuation). Keeps clean values unquoted so diffs
 * stay minimal — matches how humans hand-write SKILL.md frontmatter.
 */
function quoteIfNeeded(value: string): string {
	if (value.length === 0) return '""';
	const needsQuote =
		/[:#]/.test(value) ||
		value !== value.trim() ||
		/^[!&*?{}[\],>|@`"']/.test(value) ||
		/^(true|false|null|yes|no|~)$/i.test(value);
	if (!needsQuote) return value;
	// Prefer double quotes; escape embedded double quotes + backslashes.
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Extract the `key:` from a raw YAML line, or null if it is not a top-level scalar. */
function lineKey(line: string): string | null {
	const match = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
	return match ? match[1] : null;
}

/**
 * Parse a SKILL.md document into frontmatter + body. Tolerant of a missing
 * fence (treats the whole input as body with empty frontmatter), mirroring the
 * router's `parseFrontmatter` leniency.
 */
export function parseSkillDocument(content: string): ParsedSkillDocument {
	const eol = detectEol(content);
	const normalized = content.replace(/\r\n/g, "\n");

	if (!normalized.startsWith(`${FENCE}\n`) && normalized.trimStart() !== "") {
		// No leading fence → no frontmatter.
		if (!normalized.startsWith(FENCE)) {
			return {
				frontmatter: { name: "", description: "" },
				rawFrontmatterLines: [],
				hasFrontmatter: false,
				body: content,
				eol,
			};
		}
	}

	// Find the closing fence: a line that is exactly `---` after the opening one.
	const lines = normalized.split("\n");
	if (lines[0] !== FENCE) {
		return {
			frontmatter: { name: "", description: "" },
			rawFrontmatterLines: [],
			hasFrontmatter: false,
			body: content,
			eol,
		};
	}

	let closingIndex = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i] === FENCE) {
			closingIndex = i;
			break;
		}
	}

	if (closingIndex === -1) {
		// Open fence but never closed → treat as plain body to avoid data loss.
		return {
			frontmatter: { name: "", description: "" },
			rawFrontmatterLines: [],
			hasFrontmatter: false,
			body: content,
			eol,
		};
	}

	const rawFrontmatterLines = lines.slice(1, closingIndex);
	const bodyLines = lines.slice(closingIndex + 1);
	const body = bodyLines.join(eol);

	const frontmatter: SkillFrontmatter = { name: "", description: "" };
	for (const line of rawFrontmatterLines) {
		const key = lineKey(line);
		if (key !== "name" && key !== "description") continue;
		const value = unquote(line.slice(line.indexOf(":") + 1));
		if (frontmatter[key].length === 0) {
			frontmatter[key] = value;
		}
	}

	return {
		frontmatter,
		rawFrontmatterLines,
		hasFrontmatter: true,
		body,
		eol,
	};
}

/**
 * Serialize edited frontmatter back into the full document, preserving body,
 * unknown frontmatter keys, and newline style. Updates the `name`/`description`
 * lines in place when present; otherwise prepends them. Creates a fresh fenced
 * block when the source had none.
 */
export function serializeSkillDocument(
	parsed: ParsedSkillDocument,
	next: SkillFrontmatter,
): string {
	const { eol } = parsed;
	const nameLine = `name: ${quoteIfNeeded(next.name)}`;
	const descriptionLine = `description: ${quoteIfNeeded(next.description)}`;

	if (!parsed.hasFrontmatter) {
		const bodyPrefix = parsed.body.length > 0 ? `${eol}${eol}` : "";
		return `${FENCE}${eol}${nameLine}${eol}${descriptionLine}${eol}${FENCE}${bodyPrefix}${parsed.body}`;
	}

	const updated: string[] = [];
	let wroteName = false;
	let wroteDescription = false;
	for (const line of parsed.rawFrontmatterLines) {
		const key = lineKey(line);
		if (key === "name" && !wroteName) {
			updated.push(nameLine);
			wroteName = true;
			continue;
		}
		if (key === "description" && !wroteDescription) {
			updated.push(descriptionLine);
			wroteDescription = true;
			continue;
		}
		updated.push(line);
	}
	// Prepend any field that did not already exist (name first, then description).
	const prepend: string[] = [];
	if (!wroteName) prepend.push(nameLine);
	if (!wroteDescription) prepend.push(descriptionLine);

	const block = [...prepend, ...updated];
	return `${FENCE}${eol}${block.join(eol)}${eol}${FENCE}${parsed.body.length > 0 || parsed.rawFrontmatterLines.length > 0 ? eol : ""}${parsed.body}`;
}

/**
 * Convenience: apply a frontmatter edit directly to raw document text. Used by
 * the form ↔ editor two-way sync so a field edit produces new editor text and
 * vice versa.
 */
export function applyFrontmatterEdit(
	content: string,
	next: SkillFrontmatter,
): string {
	return serializeSkillDocument(parseSkillDocument(content), next);
}
