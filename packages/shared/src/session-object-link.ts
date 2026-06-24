/**
 * Pure mapping + presentation helpers for the object-linked-chat surface
 * (`projectOs.objectLinkedChat`), shared cross-platform (web + desktop). Three
 * concerns, all dependency-free (no React, no tRPC, and intentionally no
 * `@rox/db` import so `@rox/shared` stays db-free — the same inline-mirror rule
 * as `unified-search-results.ts` / `rox-ledger-kind.ts`; `@rox/db` depends on
 * `@rox/shared`, so the reverse edge would be a cycle) so each platform's panel
 * stays a thin render layer and the logic is unit-testable:
 *
 *  1. `sessionEntityEnsureInput` — the `graph.create` args that get-or-create the
 *     `agent_session` graph node for a chat session. The chat session lives in
 *     `chat_sessions` (org-scoped, Electric-synced) and has no graph node until
 *     first linked; `graph.create` is idempotent on `idempotencyKey`, so a
 *     DETERMINISTIC key derived from the session id makes "ensure the session
 *     entity" safe and replay-stable (a replay returns the cached entity instead
 *     of colliding on the deterministic slug). No migration, no new procedure.
 *  2. `sessionLinkInput` — the `graph.link` args (session node + picked target +
 *     relation) for relating the session to a Project-OS object.
 *  3. `mapSessionLinks` — the readout: maps a `graph.neighbors` result (edges
 *     incident to the session node) into the rows the panel renders.
 */

/**
 * A graph-object kind, mirrored as a string to keep `@rox/shared` db-free (same
 * rule as `UnifiedSearchEntityKind`). The consuming layers (`apps/web`,
 * `apps/desktop`) pass real `EntityKind` values, which structurally satisfy
 * `string`; unknown kinds degrade to the raw kind label.
 */
export type SessionLinkEntityKind = string;

/** The relations this control offers — a chat session is `about` or `references` an object. */
export const SESSION_LINK_RELATIONS = ["about", "references"] as const;
export type SessionLinkRelation = (typeof SESSION_LINK_RELATIONS)[number];

export function isSessionLinkRelation(
	value: string,
): value is SessionLinkRelation {
	return (SESSION_LINK_RELATIONS as readonly string[]).includes(value);
}

/** RU labels for the offered relations. */
const RELATION_LABELS: Record<SessionLinkRelation, string> = {
	about: "по теме",
	references: "ссылается на",
};

export function sessionLinkRelationLabel(
	relation: SessionLinkRelation,
): string {
	return RELATION_LABELS[relation];
}

// ---------------------------------------------------------------------------
// Deterministic UUIDv5 (RFC 4122) — pure, dependency-free.
//
// `graph.create`'s idempotency key MUST be a UUID and MUST be stable across
// calls for the SAME chat session (otherwise a second ensure with a fresh key
// would collide on the deterministic `chat-session-<id>` slug). We derive a v5
// UUID from the session id under a fixed namespace. Implemented inline (no
// `uuid` dependency in this workspace) with a compact SHA-1.
// ---------------------------------------------------------------------------

/** Fixed namespace for chat-session → graph-node idempotency keys (a random v4). */
export const SESSION_ENTITY_NAMESPACE = "6f1b2c34-5d6e-4f80-9a1b-2c3d4e5f6071";

function rotl(n: number, s: number): number {
	return ((n << s) | (n >>> (32 - s))) >>> 0;
}

/** Minimal SHA-1 over a byte array, returning 20 bytes. */
function sha1(bytes: Uint8Array): Uint8Array {
	const ml = bytes.length * 8;
	// Pad: append 0x80, then zeros, then 64-bit big-endian length.
	const withLenLen = bytes.length + 1 + 8;
	const padded = new Uint8Array(Math.ceil(withLenLen / 64) * 64);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	// 64-bit length (high 32 bits assumed 0 for our small inputs).
	const dv = new DataView(padded.buffer);
	dv.setUint32(padded.length - 4, ml >>> 0, false);
	dv.setUint32(padded.length - 8, Math.floor(ml / 0x100000000), false);

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;

	const w = new Uint32Array(80);
	for (let i = 0; i < padded.length; i += 64) {
		for (let j = 0; j < 16; j++) {
			w[j] = dv.getUint32(i + j * 4, false);
		}
		for (let j = 16; j < 80; j++) {
			// biome-ignore lint/style/noNonNullAssertion: j-N indices are in-bounds by loop construction
			w[j] = rotl(w[j - 3]! ^ w[j - 8]! ^ w[j - 14]! ^ w[j - 16]!, 1);
		}
		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;
		for (let j = 0; j < 80; j++) {
			let f: number;
			let k: number;
			if (j < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (j < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (j < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8f1bbcdc;
			} else {
				f = b ^ c ^ d;
				k = 0xca62c1d6;
			}
			// biome-ignore lint/style/noNonNullAssertion: j is in [0,80) so w[j] is defined
			const temp = (rotl(a, 5) + f + e + k + w[j]!) >>> 0;
			e = d;
			d = c;
			c = rotl(b, 30);
			b = a;
			a = temp;
		}
		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
	}

	const out = new Uint8Array(20);
	const odv = new DataView(out.buffer);
	odv.setUint32(0, h0, false);
	odv.setUint32(4, h1, false);
	odv.setUint32(8, h2, false);
	odv.setUint32(12, h3, false);
	odv.setUint32(16, h4, false);
	return out;
}

function uuidToBytes(uuid: string): Uint8Array {
	const hex = uuid.replaceAll("-", "");
	const out = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function bytesToUuid(bytes: Uint8Array): string {
	const hex: string[] = [];
	for (const byte of bytes) {
		hex.push(byte.toString(16).padStart(2, "0"));
	}
	return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
		.slice(6, 8)
		.join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * RFC 4122 §4.3 name-based UUIDv5 (SHA-1) of `name` under `namespace`. Stable:
 * same inputs always yield the same UUID. Used to derive a replay-stable
 * idempotency key for the session's graph node.
 */
export function uuidv5(name: string, namespace: string): string {
	const nsBytes = uuidToBytes(namespace);
	const nameBytes = new TextEncoder().encode(name);
	const data = new Uint8Array(nsBytes.length + nameBytes.length);
	data.set(nsBytes);
	data.set(nameBytes, nsBytes.length);
	const hash = sha1(data);
	const out = hash.slice(0, 16);
	// biome-ignore lint/style/noNonNullAssertion: out has 16 bytes, indices 6/8 exist
	out[6] = (out[6]! & 0x0f) | 0x50; // version 5
	// biome-ignore lint/style/noNonNullAssertion: out has 16 bytes, indices 6/8 exist
	out[8] = (out[8]! & 0x3f) | 0x80; // RFC 4122 variant
	return bytesToUuid(out);
}

// ---------------------------------------------------------------------------
// 1. ensure the session graph node
// ---------------------------------------------------------------------------

/** The kebab slug that addresses a chat session's graph node. */
export function sessionEntitySlug(sessionId: string): string {
	return `chat-session-${sessionId.toLowerCase()}`;
}

/** Deterministic, replay-stable idempotency key for ensuring the session node. */
export function sessionEntityIdempotencyKey(sessionId: string): string {
	return uuidv5(`chat-session/${sessionId}`, SESSION_ENTITY_NAMESPACE);
}

/**
 * Args for `graph.create` matching `graphCreateSchema`. `kind` is the exact
 * literal `"agent_session"` (not the open `SessionLinkEntityKind`) so it stays
 * assignable to the `graph.create` input's `EntityKind` union WITHOUT importing
 * `@rox/db` here (the literal is a member of that union). Keeps `@rox/shared`
 * db-free while letting both the web and desktop callers pass this straight to
 * `graph.create`.
 */
export interface SessionEntityEnsureInput {
	idempotencyKey: string;
	kind: "agent_session";
	title: string;
	slug: string;
	sourceRef: { conversationId: string };
}

/**
 * Build the `graph.create` args that get-or-create the `agent_session` node for
 * a chat session. Idempotent on the deterministic key, so calling it on every
 * link is safe — the first call inserts, later calls return the same node.
 */
export function sessionEntityEnsureInput(
	sessionId: string,
	title?: string | null,
): SessionEntityEnsureInput {
	const trimmed = title?.trim();
	return {
		idempotencyKey: sessionEntityIdempotencyKey(sessionId),
		kind: "agent_session",
		title:
			trimmed && trimmed.length > 0
				? trimmed.slice(0, 300)
				: `Сессия ${sessionId.slice(0, 8)}`,
		slug: sessionEntitySlug(sessionId),
		sourceRef: { conversationId: sessionId },
	};
}

// ---------------------------------------------------------------------------
// 2. link the session to a target object
// ---------------------------------------------------------------------------

/** A target object the user picked to link the session to. */
export interface SessionLinkTarget {
	entityId: string;
	/** Optional slug; when present the edge can be slug-addressed (resolved later). */
	slug?: string | null;
}

/** Args for `graph.link` matching `graphLinkSchema`. */
export interface SessionLinkInput {
	idempotencyKey: string;
	sourceEntityId: string;
	targetEntityId: string;
	relation: SessionLinkRelation;
}

/**
 * Build the `graph.link` args relating the session node (`sourceEntityId`) to a
 * picked target object with the chosen relation. The idempotency key is fresh
 * per link action (a UUID supplied by the caller) — re-linking is an explicit
 * user action, not a replay-dedup concern. We always link by `targetEntityId`
 * (the picker resolves a concrete entity), so the edge is resolved immediately.
 */
export function sessionLinkInput(params: {
	sessionEntityId: string;
	target: SessionLinkTarget;
	relation: SessionLinkRelation;
	idempotencyKey: string;
}): SessionLinkInput {
	return {
		idempotencyKey: params.idempotencyKey,
		sourceEntityId: params.sessionEntityId,
		targetEntityId: params.target.entityId,
		relation: params.relation,
	};
}

// ---------------------------------------------------------------------------
// 3. readout: map graph.neighbors -> rows the panel renders
// ---------------------------------------------------------------------------

/** The slice of a `graph.neighbors` result this surface consumes. */
export interface NeighborsResultSlice {
	nodes: ReadonlyArray<{
		entityId: string;
		kind: SessionLinkEntityKind;
		title: string;
		slug: string | null;
	}>;
	edges: ReadonlyArray<{
		id: string;
		sourceEntityId: string;
		targetEntityId: string | null;
		relation: string;
	}>;
}

/** A presentational row for one existing link from the session. */
export interface SessionLinkRow {
	edgeId: string;
	relation: string;
	relationLabel: string;
	targetEntityId: string;
	targetKind: SessionLinkEntityKind | null;
	targetTitle: string;
	targetSlug: string | null;
}

const KIND_LABELS: Record<string, string> = {
	note: "Заметка",
	task: "Задача",
	project: "Проект",
	contact: "Контакт",
	feed: "Лента",
	file: "Файл",
	agent_session: "Сессия агента",
	area: "Область",
	calendar_event: "Событие",
	journal: "Журнал",
	channel: "Канал",
	design_artifact: "Дизайн",
};

export function sessionLinkKindLabel(kind: SessionLinkEntityKind): string {
	return KIND_LABELS[kind] ?? kind;
}

function relationLabel(relation: string): string {
	return isSessionLinkRelation(relation)
		? sessionLinkRelationLabel(relation)
		: relation;
}

/**
 * Map a `graph.neighbors` result for the session node into the OUTGOING links
 * this session has made — edges whose `sourceEntityId` is the session node. The
 * target node metadata (kind/title/slug) is joined from the result's `nodes`.
 * Incoming edges and self-edges are dropped: this readout answers "what objects
 * is THIS session linked to?".
 */
export function mapSessionLinks(
	sessionEntityId: string,
	result: NeighborsResultSlice,
): SessionLinkRow[] {
	const nodeById = new Map(result.nodes.map((n) => [n.entityId, n]));
	const rows: SessionLinkRow[] = [];
	for (const edge of result.edges) {
		if (edge.sourceEntityId !== sessionEntityId) continue;
		if (!edge.targetEntityId) continue;
		if (edge.targetEntityId === sessionEntityId) continue;
		const target = nodeById.get(edge.targetEntityId);
		rows.push({
			edgeId: edge.id,
			relation: edge.relation,
			relationLabel: relationLabel(edge.relation),
			targetEntityId: edge.targetEntityId,
			targetKind: target?.kind ?? null,
			targetTitle: target?.title ?? edge.targetEntityId,
			targetSlug: target?.slug ?? null,
		});
	}
	return rows;
}
