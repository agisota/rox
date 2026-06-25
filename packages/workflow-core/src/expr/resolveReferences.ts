/**
 * Cross-node data-passing resolver (#550).
 *
 * Expands `{{<ref>.<path>}}` placeholders in a node's config against the
 * outputs of *reachable upstream* nodes. `<ref>` is either a block id or a
 * human-facing block name (case-insensitive); `<path>` is a dotted path into
 * that node's output record (e.g. `{{retrieval.chunks}}`, `{{Model 1.text}}`).
 *
 * Pure and side-effect free: it takes an explicit map of resolvable upstream
 * outputs (the caller scopes this to reachable ancestors via `reachability`)
 * and returns the expanded value. Resolution is NOT `eval` — placeholders are
 * matched with a regex and resolved with a safe dotted-path getter.
 *
 * Failure is explicit: an unknown node reference or a missing path throws a
 * {@link ReferenceResolutionError} so the executor can route the node to its
 * `error` handle instead of silently substituting `undefined`.
 */

/** A single resolvable upstream node: its output plus optional display name. */
export interface ResolvableNode {
	/** Block id (graph key). */
	id: string;
	/** Optional human-facing name (NodeInspector). Matched case-insensitively. */
	name?: string;
	/** The node's produced output record. */
	output: Record<string, unknown>;
}

/** Raised when a `{{ref.path}}` cannot be resolved. */
export class ReferenceResolutionError extends Error {
	readonly code = "REFERENCE_UNRESOLVED";
	/** The full placeholder body that failed, e.g. `retrieval.chunks`. */
	readonly reference: string;
	/** Why it failed: the node ref was unknown, or the path missed. */
	readonly reason: "unknown-node" | "unknown-path";

	constructor(
		reference: string,
		reason: "unknown-node" | "unknown-path",
		message: string,
	) {
		super(message);
		this.name = "ReferenceResolutionError";
		this.reference = reference;
		this.reason = reason;
	}
}

/**
 * `{{ ref.path }}` — `ref` is the first dotted segment (block id or name; note a
 * name may itself contain spaces, so the ref is everything up to the first dot
 * only when the leading segment matches a known node — see `splitReference`).
 * The captured body is the trimmed inner text; segmentation happens in code so
 * names like `Model 1` resolve without a brittle regex.
 */
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Walk a dotted path (`a.b.c`) against a value. Returns a miss sentinel. */
const MISS = Symbol("path-miss");
function getPath(source: unknown, path: string): unknown | typeof MISS {
	let cur: unknown = source;
	for (const key of path.split(".")) {
		if (cur == null || typeof cur !== "object") return MISS;
		if (!(key in (cur as Record<string, unknown>))) return MISS;
		cur = (cur as Record<string, unknown>)[key];
	}
	return cur;
}

/**
 * Split a placeholder body into a `{ node, path }` pair. The node reference is
 * the longest leading run of segments that matches a known node id or name;
 * the remainder is the path. This lets node names contain dots/spaces while a
 * bare `id.field` still splits at the first dot. Returns `undefined` when no
 * known node prefixes the body.
 */
function splitReference(
	body: string,
	byId: Map<string, ResolvableNode>,
	byName: Map<string, ResolvableNode>,
): { node: ResolvableNode; path: string } | undefined {
	const segments = body.split(".");
	// Try the longest node-ref prefix first so `Model 1.text` (name with a
	// space) and `a.b.c` (id `a`) both resolve deterministically.
	for (let take = segments.length - 1; take >= 1; take--) {
		const refKey = segments.slice(0, take).join(".");
		const node = byId.get(refKey) ?? byName.get(refKey.toLowerCase());
		if (node) {
			return { node, path: segments.slice(take).join(".") };
		}
	}
	return undefined;
}

function indexNodes(nodes: ResolvableNode[]): {
	byId: Map<string, ResolvableNode>;
	byName: Map<string, ResolvableNode>;
} {
	const byId = new Map<string, ResolvableNode>();
	const byName = new Map<string, ResolvableNode>();
	for (const node of nodes) {
		byId.set(node.id, node);
		if (node.name != null && node.name.trim() !== "") {
			byName.set(node.name.toLowerCase(), node);
		}
	}
	return { byId, byName };
}

/** Does this string contain at least one `{{...}}` placeholder? */
export function hasReference(value: string): boolean {
	PLACEHOLDER.lastIndex = 0;
	return PLACEHOLDER.test(value);
}

/**
 * A placeholder whose leading segment does NOT name a known node is left for a
 * later single-scope resolver (e.g. `{{chunks}}` against the immediate input).
 * `resolveOne` returns this sentinel so the template functions keep the original
 * `{{...}}` text verbatim instead of erroring — only a *node* reference with a
 * bad path is a hard error (#550).
 */
const NOT_A_NODE_REF = Symbol("not-a-node-ref");

/**
 * Expand cross-node `{{node.path}}` references in `template` against `nodes`.
 * A whole-string node reference preserves the resolved value's type (so
 * `{{retrieval.chunks}}` passes an array/object through); mixed text
 * interpolates a JSON-stringified form. Placeholders that don't name a known
 * node are left untouched for downstream single-scope resolution. A node
 * reference with a missing path throws {@link ReferenceResolutionError}.
 */
export function resolveTemplate(
	template: string,
	nodes: ResolvableNode[],
): unknown {
	const { byId, byName } = indexNodes(nodes);

	// Whole-string single placeholder → preserve the resolved value's type.
	const whole = template.match(/^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/);
	const wholeBody = whole?.[1];
	if (wholeBody != null) {
		const resolved = resolveOne(wholeBody.trim(), byId, byName);
		return resolved === NOT_A_NODE_REF ? template : resolved;
	}

	return template.replace(PLACEHOLDER, (match, raw: string) => {
		const value = resolveOne(raw.trim(), byId, byName);
		if (value === NOT_A_NODE_REF) return match; // leave intact
		return typeof value === "string" ? value : JSON.stringify(value);
	});
}

function resolveOne(
	body: string,
	byId: Map<string, ResolvableNode>,
	byName: Map<string, ResolvableNode>,
): unknown | typeof NOT_A_NODE_REF {
	const split = splitReference(body, byId, byName);
	if (!split) return NOT_A_NODE_REF;
	const value = getPath(split.node.output, split.path);
	if (value === MISS) {
		throw new ReferenceResolutionError(
			body,
			"unknown-path",
			`Reference "{{${body}}}" path "${split.path}" is missing on node "${split.node.id}".`,
		);
	}
	return value;
}

/**
 * Recursively resolve `{{ref.path}}` references throughout an arbitrary config
 * value (the merged input or a node's `subBlocks`). Strings are expanded;
 * arrays and plain objects are walked; other primitives pass through. Throws a
 * {@link ReferenceResolutionError} on the first unresolved reference.
 */
export function resolveReferences(
	value: unknown,
	nodes: ResolvableNode[],
): unknown {
	if (typeof value === "string") {
		return hasReference(value) ? resolveTemplate(value, nodes) : value;
	}
	if (Array.isArray(value)) {
		return value.map((v) => resolveReferences(v, nodes));
	}
	if (value != null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = resolveReferences(v, nodes);
		}
		return out;
	}
	return value;
}

/** Resolve references in a record, returning a new record (input/subBlocks). */
export function resolveRecordReferences(
	record: Record<string, unknown>,
	nodes: ResolvableNode[],
): Record<string, unknown> {
	return resolveReferences(record, nodes) as Record<string, unknown>;
}
