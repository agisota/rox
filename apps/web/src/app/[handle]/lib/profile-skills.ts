import "server-only";
import { db } from "@rox/db/client";
import type { SkillKind } from "@rox/db/schema";
import { slugify } from "@rox/shared/share-link";

/**
 * Public, read-only projection of a user's published skill for the
 * `@<handle>/skills` namespace (ROX-522 Phase 2.2).
 *
 * SECURITY: only skills the owner explicitly marked `visibility = "public"` are
 * exposed, scoped to the profile owner (`ownerUserId`). Org/project ids and
 * other tenancy columns are intentionally not projected.
 */
export type PublicSkillSummary = {
	id: string;
	/** URL slug derived from the skill name (matches `buildSkillLink`). */
	slug: string;
	name: string;
	description: string | null;
	kind: SkillKind;
	category: string | null;
	icon: string | null;
};

/**
 * A file inside a published skill's documentation tree. Mirrors the
 * `/@<handle>/skills/<skilltitle>` folder/subfolder/file shape the product
 * wants: a skill is a folder, its sections are files.
 */
export type PublicSkillFile = {
	/** Display name, e.g. `SKILL.md` or an example title. */
	name: string;
	/** Logical folder this file lives under (empty string = skill root). */
	folder: string;
	/** Rendered text content (markdown or serialized example). */
	content: string;
};

export type PublicSkillDetail = PublicSkillSummary & {
	files: PublicSkillFile[];
};

type SkillExampleLike = {
	title?: unknown;
	description?: unknown;
	input?: unknown;
	output?: unknown;
};

/**
 * The public profile slugifies skill names into the URL via `buildSkillLink`,
 * which is lossy (two skills could share a slug). We resolve by recomputing the
 * slug for each of the owner's public skills, so the route param always maps
 * back to a real owned skill without storing a separate slug column.
 */
function toSummary(row: {
	id: string;
	name: string;
	description: string | null;
	kind: SkillKind;
	category: string | null;
	icon: string | null;
}): PublicSkillSummary {
	return {
		id: row.id,
		slug: slugify(row.name),
		name: row.name,
		description: row.description,
		kind: row.kind,
		category: row.category,
		icon: row.icon,
	};
}

/**
 * List a user's publicly-visible skills, newest first. Returns `[]` when the
 * user has published none.
 */
export async function getPublicSkills(
	ownerUserId: string,
): Promise<PublicSkillSummary[]> {
	const rows = await db.query.skills.findMany({
		where: (skills, { and, eq }) =>
			and(eq(skills.ownerUserId, ownerUserId), eq(skills.visibility, "public")),
		columns: {
			id: true,
			name: true,
			description: true,
			kind: true,
			category: true,
			icon: true,
			createdAt: true,
		},
		orderBy: (skills, { desc }) => desc(skills.createdAt),
	});

	return rows.map(toSummary);
}

function stringifyExampleValue(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function exampleToFile(
	example: SkillExampleLike,
	index: number,
): PublicSkillFile {
	const title =
		typeof example.title === "string" && example.title.trim()
			? example.title.trim()
			: `Пример ${index + 1}`;
	const parts: string[] = [];
	if (typeof example.description === "string" && example.description.trim()) {
		parts.push(example.description.trim());
	}
	if (example.input !== undefined) {
		parts.push(`Вход:\n${stringifyExampleValue(example.input)}`);
	}
	if (example.output !== undefined) {
		parts.push(`Выход:\n${stringifyExampleValue(example.output)}`);
	}
	return {
		name: `${slugify(title) || `example-${index + 1}`}.md`,
		folder: "examples",
		content: parts.join("\n\n") || title,
	};
}

/**
 * Resolve a single public skill by its slugified name for a given owner, and
 * project its documentation into a folder/file tree:
 *   - `SKILL.md` (root) ← `skill_versions.documentation_md`
 *   - `examples/<slug>.md` ← each `skill_versions.examples[]` entry
 *
 * Returns `null` when no public skill of the owner slugifies to `slug`.
 */
export async function getPublicSkillBySlug(
	ownerUserId: string,
	slug: string,
): Promise<PublicSkillDetail | null> {
	const rows = await db.query.skills.findMany({
		where: (skills, { and, eq }) =>
			and(eq(skills.ownerUserId, ownerUserId), eq(skills.visibility, "public")),
		columns: {
			id: true,
			name: true,
			description: true,
			kind: true,
			category: true,
			icon: true,
			currentVersionId: true,
		},
		with: {
			versions: {
				columns: {
					id: true,
					documentationMd: true,
					examples: true,
				},
			},
		},
	});

	const match = rows.find((row) => slugify(row.name) === slug);
	if (!match) return null;

	const summary = toSummary(match);
	const version =
		match.versions.find((v) => v.id === match.currentVersionId) ??
		match.versions[0] ??
		null;

	const files: PublicSkillFile[] = [];
	const documentationMd = version?.documentationMd?.trim();
	if (documentationMd) {
		files.push({ name: "SKILL.md", folder: "", content: documentationMd });
	} else if (summary.description) {
		files.push({
			name: "SKILL.md",
			folder: "",
			content: summary.description,
		});
	}

	const examples = Array.isArray(version?.examples) ? version.examples : [];
	examples.forEach((example, index) => {
		if (example && typeof example === "object") {
			files.push(exampleToFile(example as SkillExampleLike, index));
		}
	});

	return { ...summary, files };
}
