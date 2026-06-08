/**
 * MDX security for the knowledge / notebook layer (fumadocs epic).
 *
 * Knowledge documents are user/agent-authored MDX rendered inside apps/web. To
 * keep rendering safe we enforce an allow-list of components and reject any MDX
 * that tries to:
 *   - `import` / `export` (would pull in arbitrary modules / leak scope)
 *   - embed raw `<script>` / event-handler HTML
 *   - reference a non-whitelisted JSX component
 *   - use `{...}` JS expressions (arbitrary evaluation at render time)
 *
 * The same checks run in both the build-time (fumadocs collection) and runtime
 * (DB-backed `render-mdx`) paths so there is a single source of truth.
 */

/**
 * The exact set of components the notebook MDX renderer registers. Anything
 * else referenced as a JSX tag is rejected. Standard markdown elements (which
 * compile to lowercase intrinsic tags like `p`, `a`, `h1`) are always allowed.
 */
export const ALLOWED_MDX_COMPONENTS = [
	"Callout",
	"Card",
	"Cards",
	"Tabs",
	"Tab",
	"Accordion",
	"Accordions",
	"Steps",
	"Step",
	"Mermaid",
	"AgentRun",
	"ArtifactCard",
	"WorkflowDiagram",
] as const;

export type AllowedMdxComponent = (typeof ALLOWED_MDX_COMPONENTS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_MDX_COMPONENTS);

export interface MdxSecurityViolation {
	rule:
		| "import"
		| "export"
		| "script"
		| "html-event-handler"
		| "javascript-uri"
		| "expression"
		| "disallowed-component";
	message: string;
	/** The offending token, when applicable. */
	match?: string;
}

export interface MdxSecurityResult {
	ok: boolean;
	violations: MdxSecurityViolation[];
}

// A JSX tag is uppercase-initial (component) vs lowercase (intrinsic element).
const JSX_TAG_RE = /<([A-Za-z][A-Za-z0-9]*)/g;
const IMPORT_RE = /^\s*import\s/m;
const EXPORT_RE = /^\s*export\s/m;
const SCRIPT_RE = /<\s*script[\s>]/i;
const STYLE_RE = /<\s*style[\s>]/i;
const EVENT_HANDLER_RE = /<[^>]*\son[a-z]+\s*=/i;
const JS_URI_RE = /(?:href|src)\s*=\s*["']?\s*javascript:/i;
// `{ ... }` expression containers in MDX (but not the escaped `\{` form).
const EXPRESSION_RE = /(^|[^\\])\{[^}]*\}/;

/**
 * Statically analyze MDX source and collect every security violation.
 * Pure + dependency-free so it can run anywhere (build, runtime, tests).
 */
export function analyzeMdxSecurity(source: string): MdxSecurityResult {
	const violations: MdxSecurityViolation[] = [];

	if (IMPORT_RE.test(source)) {
		violations.push({
			rule: "import",
			message: "`import` statements are not allowed in knowledge MDX",
		});
	}
	if (EXPORT_RE.test(source)) {
		violations.push({
			rule: "export",
			message: "`export` statements are not allowed in knowledge MDX",
		});
	}
	if (SCRIPT_RE.test(source) || STYLE_RE.test(source)) {
		violations.push({
			rule: "script",
			message: "`<script>`/`<style>` tags are not allowed in knowledge MDX",
		});
	}
	if (EVENT_HANDLER_RE.test(source)) {
		violations.push({
			rule: "html-event-handler",
			message: "Inline event handlers (onClick, onError, …) are not allowed",
		});
	}
	if (JS_URI_RE.test(source)) {
		violations.push({
			rule: "javascript-uri",
			message: "`javascript:` URIs are not allowed",
		});
	}

	// Disallowed component tags.
	const seen = new Set<string>();
	for (const m of source.matchAll(JSX_TAG_RE)) {
		const tag = m[1];
		if (!tag) continue;
		// Lowercase-initial = intrinsic markdown element; allowed.
		if (tag[0] === tag[0]?.toLowerCase()) continue;
		if (ALLOWED_SET.has(tag) || seen.has(tag)) continue;
		seen.add(tag);
		violations.push({
			rule: "disallowed-component",
			message: `<${tag}> is not an allowed knowledge component`,
			match: tag,
		});
	}

	// JS expression containers. Allow only after the disallowed-component check
	// so the more specific error wins for component-shaped expressions.
	if (EXPRESSION_RE.test(source)) {
		violations.push({
			rule: "expression",
			message:
				"JavaScript expressions `{ ... }` are not allowed in knowledge MDX",
		});
	}

	return { ok: violations.length === 0, violations };
}

/** Convenience boolean wrapper around {@link analyzeMdxSecurity}. */
export function isMdxSafe(source: string): boolean {
	return analyzeMdxSecurity(source).ok;
}

export class MdxSecurityError extends Error {
	readonly violations: MdxSecurityViolation[];
	constructor(violations: MdxSecurityViolation[]) {
		super(
			`Knowledge MDX rejected: ${violations.map((v) => v.message).join("; ")}`,
		);
		this.name = "MdxSecurityError";
		this.violations = violations;
	}
}

/**
 * Assert MDX is safe, throwing {@link MdxSecurityError} otherwise. Use at every
 * trust boundary that compiles/renders user- or agent-authored MDX.
 */
export function assertMdxSafe(source: string): void {
	const result = analyzeMdxSecurity(source);
	if (!result.ok) {
		throw new MdxSecurityError(result.violations);
	}
}
