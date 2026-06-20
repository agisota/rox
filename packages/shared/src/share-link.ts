/**
 * Canonical share-link builders + parser for the public `@<handle>` namespace
 * (ROX-522). Pure string logic — no I/O, no DB.
 *
 * URL shapes:
 *   - /@<handle>/shared/sessions/<id>-<slug>-<DD>-<MM>-<YYYY>/
 *   - /@<handle>/shared/artifacts/<id>-<slug>-<DD>-<MM>-<YYYY>
 *   - /@<handle>/skills/<skilltitle>
 *   - /@<handle>/{agents,subagents,hooks,drive,feed,projects,stats}
 *
 * `build*` produces the canonical path; `parseSharePath` is the inverse and
 * returns a discriminated resolver shape. Round-tripping a built path through
 * `parseSharePath` recovers the original parts (the title/slug is lossy in the
 * obvious slugify sense, but the slug is preserved verbatim).
 */

// ---------------------------------------------------------------------------
// Section paths
// ---------------------------------------------------------------------------

export const SHARE_SECTIONS = [
	"agents",
	"subagents",
	"hooks",
	"drive",
	"feed",
	"projects",
	"stats",
] as const;
export type ShareSection = (typeof SHARE_SECTIONS)[number];

/** Resources that live under `/@<handle>/shared/<resource>/…`. */
export const SHARED_RESOURCES = ["sessions", "artifacts"] as const;
export type SharedResource = (typeof SHARED_RESOURCES)[number];

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

/**
 * Lowercase, ASCII-only, hyphen-separated slug. Diacritics are stripped via
 * NFKD; any run of non-`[a-z0-9]` becomes a single hyphen; leading/trailing
 * hyphens are trimmed. Empty/symbol-only input yields the empty string so the
 * caller can decide on a fallback.
 */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Date <-> DD-MM-YYYY
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Format a `Date` as zero-padded `DD-MM-YYYY` (UTC). */
export function formatShareDate(date: Date): string {
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
	return `${dd}-${mm}-${yyyy}`;
}

/** Parse a `DD-MM-YYYY` string into its numeric parts, or `null` if malformed. */
export function parseShareDate(
	value: string,
): { day: number; month: number; year: number } | null {
	const match = DATE_RE.exec(value);
	if (!match) return null;
	const day = Number(match[1]);
	const month = Number(match[2]);
	const year = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	return { day, month, year };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export interface SharedResourceLinkInput {
	handle: string;
	resource: SharedResource;
	id: string;
	/** Human title; slugified into the path. */
	title: string;
	date: Date;
}

function resourceSegment(id: string, title: string, date: Date): string {
	const slug = slugify(title);
	const base = slug ? `${id}-${slug}` : id;
	return `${base}-${formatShareDate(date)}`;
}

/**
 * `/@<handle>/shared/sessions/<id>-<slug>-<DD>-<MM>-<YYYY>/`
 * `/@<handle>/shared/artifacts/<id>-<slug>-<DD>-<MM>-<YYYY>`
 * Sessions get a trailing slash (canonical); artifacts do not.
 */
export function buildSharedResourceLink(
	input: SharedResourceLinkInput,
): string {
	const { handle, resource, id, title, date } = input;
	const segment = resourceSegment(id, title, date);
	const trailing = resource === "sessions" ? "/" : "";
	return `/@${handle}/shared/${resource}/${segment}${trailing}`;
}

/** `/@<handle>/shared/sessions/<id>-<slug>-<DD>-<MM>-<YYYY>/` */
export function buildSharedSessionLink(
	input: Omit<SharedResourceLinkInput, "resource">,
): string {
	return buildSharedResourceLink({ ...input, resource: "sessions" });
}

/** `/@<handle>/shared/artifacts/<id>-<slug>-<DD>-<MM>-<YYYY>` */
export function buildSharedArtifactLink(
	input: Omit<SharedResourceLinkInput, "resource">,
): string {
	return buildSharedResourceLink({ ...input, resource: "artifacts" });
}

/** `/@<handle>/skills/<skilltitle>` (title slugified). */
export function buildSkillLink(handle: string, skillTitle: string): string {
	return `/@${handle}/skills/${slugify(skillTitle)}`;
}

/** `/@<handle>/<section>` for a fixed section path. */
export function buildSectionLink(
	handle: string,
	section: ShareSection,
): string {
	return `/@${handle}/${section}`;
}

// ---------------------------------------------------------------------------
// Parser / resolver shape
// ---------------------------------------------------------------------------

export interface ParsedSharedResource {
	kind: "shared_resource";
	handle: string;
	resource: SharedResource;
	id: string;
	slug: string;
	date: { day: number; month: number; year: number };
}

export interface ParsedSkill {
	kind: "skill";
	handle: string;
	skill: string;
}

export interface ParsedSection {
	kind: "section";
	handle: string;
	section: ShareSection;
}

export type ParsedSharePath =
	| ParsedSharedResource
	| ParsedSkill
	| ParsedSection;

function splitSegments(path: string): string[] {
	return path.split("/").filter((segment) => segment.length > 0);
}

function parseResourceSegment(segment: string): {
	id: string;
	slug: string;
	date: { day: number; month: number; year: number };
} | null {
	// Trailing token is always DD-MM-YYYY; the third-from-last two tokens are
	// MM and YYYY, so the date occupies the last 3 hyphen tokens.
	const parts = segment.split("-");
	if (parts.length < 4) return null;
	const dateStr = parts.slice(-3).join("-");
	const date = parseShareDate(dateStr);
	if (!date) return null;
	const rest = parts.slice(0, -3);
	const id = rest[0];
	if (!id) return null;
	const slug = rest.slice(1).join("-");
	return { id, slug, date };
}

/**
 * Parse a canonical share path back into a resolver shape, or `null` if it
 * does not match any known pattern. Accepts an optional trailing slash.
 */
export function parseSharePath(path: string): ParsedSharePath | null {
	const segments = splitSegments(path);
	const [handleSegment, ...rest] = segments;
	if (!handleSegment || !handleSegment.startsWith("@")) return null;
	const handle = handleSegment.slice(1);
	if (handle.length === 0) return null;

	// /@<handle>/shared/<resource>/<segment>
	if (rest[0] === "shared" && rest.length === 3) {
		const resource = rest[1] as SharedResource;
		const segment = rest[2];
		if (!segment || !SHARED_RESOURCES.includes(resource)) return null;
		const parsed = parseResourceSegment(segment);
		if (!parsed) return null;
		return { kind: "shared_resource", handle, resource, ...parsed };
	}

	// /@<handle>/skills/<skilltitle>
	if (rest[0] === "skills" && rest.length === 2) {
		const skill = rest[1];
		if (!skill) return null;
		return { kind: "skill", handle, skill };
	}

	// /@<handle>/<section>
	if (rest.length === 1) {
		const section = rest[0] as ShareSection;
		if (!SHARE_SECTIONS.includes(section)) return null;
		return { kind: "section", handle, section };
	}

	return null;
}
