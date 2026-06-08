/**
 * Derive a kebab-case slug from an arbitrary title, matching the shape accepted
 * by `knowledgeSlugSchema` in `@rox/shared/knowledge`
 * (`^[a-z0-9]+(?:[-/][a-z0-9]+)*$`).
 *
 * Lowercases, strips accents, replaces any run of non-alphanumerics with a
 * single hyphen, and trims leading/trailing hyphens. Returns an empty string
 * when the title has no slug-able characters (callers should treat that as
 * invalid).
 */
export function slugify(title: string): string {
	return (
		title
			.normalize("NFKD")
			// Strip the combining diacritical marks block (U+0300–U+036F) left by NFKD.
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
	);
}
