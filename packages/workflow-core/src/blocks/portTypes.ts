/**
 * Typed I/O port values — the small vocabulary a node port's `type` string is
 * drawn from, plus a pure compatibility check used by `validateGraph` (graph
 * persistence) and the desktop canvas connection guard (drag-time).
 *
 * The values are JSON-Schema `type` keywords plus a few domain shapes the merged
 * pipeline nodes actually produce (`message`, `chunks`, `rows`, `vector`). They
 * stay strings so the existing `BlockPort.type` / `NodePort.type` field needs no
 * shape change — typing a port is just setting `type` to one of these.
 *
 * Compatibility is intentionally permissive and ADDITIVE: `any` (and an absent
 * type — i.e. a legacy, untyped port) is compatible with everything. A concrete
 * type is only incompatible with a *different* concrete type. This keeps every
 * existing untyped graph valid while still catching an obviously-wrong wire
 * (e.g. a `vector` output dragged into a `message` input).
 */

/**
 * The known port value types. Open by design — the `type` field is a plain
 * string, so a node may carry a value outside this union and it is treated as
 * an opaque concrete type (compatible only with itself + `any`).
 */
export const PORT_TYPES = [
	"any",
	"string",
	"number",
	"boolean",
	"object",
	"array",
	"message",
	"chunks",
	"rows",
	"vector",
] as const;

export type PortType = (typeof PORT_TYPES)[number];

/** The wildcard type — compatible with every other port type. */
export const ANY_PORT_TYPE: PortType = "any";

/**
 * Normalise a raw port `type` value to its effective comparison form. An absent
 * type (legacy untyped port) and the explicit `any` both collapse to `any`.
 */
export function effectivePortType(type: string | undefined): string {
	return type === undefined || type === "" ? ANY_PORT_TYPE : type;
}

/**
 * Whether a value flowing out of a `source` port may be consumed by a `target`
 * port. `any` (or an absent type) on either side is always compatible; two
 * concrete types are compatible only when equal.
 *
 * Pure and order-insensitive — both the persisted-graph validator and the
 * drag-time canvas guard share this single rule.
 */
export function arePortTypesCompatible(
	source: string | undefined,
	target: string | undefined,
): boolean {
	const a = effectivePortType(source);
	const b = effectivePortType(target);
	if (a === ANY_PORT_TYPE || b === ANY_PORT_TYPE) return true;
	if (a === b) return true;
	// Text-bearing types interoperate (a `message`/`chunks` payload is consumable
	// as `string` and vice-versa) — the most common real wire. Non-text shapes
	// (vector/object/array/number/boolean) stay strict.
	return TEXT_LIKE_PORT_TYPES.has(a) && TEXT_LIKE_PORT_TYPES.has(b);
}

/**
 * Text-bearing port types that interoperate freely. An LLM/agent reply
 * (`message`) and retrieved passages (`chunks`) are textual payloads a plain
 * `string` input can consume, and vice-versa (e.g. an agent's `message` → a
 * retrieval/classifier query, or `chunks` → a model prompt).
 */
const TEXT_LIKE_PORT_TYPES = new Set<string>(["string", "message", "chunks"]);
