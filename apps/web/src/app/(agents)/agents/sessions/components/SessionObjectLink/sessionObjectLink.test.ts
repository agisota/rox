import { describe, expect, test } from "bun:test";

import {
	isSessionLinkRelation,
	mapSessionLinks,
	type NeighborsResultSlice,
	SESSION_LINK_RELATIONS,
	sessionEntityEnsureInput,
	sessionEntityIdempotencyKey,
	sessionEntitySlug,
	sessionLinkInput,
	sessionLinkRelationLabel,
	uuidv5,
} from "./sessionObjectLink";

/**
 * Pure mapping for `projectOs.objectLinkedChat`. Covers the three concerns the
 * panel delegates to so the React surface stays a thin shell:
 *   1. the deterministic `graph.create` "ensure session node" args,
 *   2. the `graph.link` args (session node + target + relation), and
 *   3. the `graph.neighbors` -> readout-rows mapping.
 */

describe("uuidv5 (deterministic, replay-stable)", () => {
	test("matches the RFC 4122 known vector for the DNS namespace", () => {
		// Canonical test vector: v5(name="www.example.com", ns=DNS) is well-known.
		const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
		expect(uuidv5("www.example.com", DNS)).toBe(
			"2ed6657d-e927-568b-95e1-2665a8aea6a2",
		);
	});

	test("is stable: same inputs always yield the same UUID", () => {
		const a = sessionEntityIdempotencyKey("sess-123");
		const b = sessionEntityIdempotencyKey("sess-123");
		expect(a).toBe(b);
		// Shape: a valid v5 UUID (version nibble 5, RFC variant 8/9/a/b).
		expect(a).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	test("differs per session id", () => {
		expect(sessionEntityIdempotencyKey("sess-a")).not.toBe(
			sessionEntityIdempotencyKey("sess-b"),
		);
	});
});

describe("sessionEntityEnsureInput (get-or-create the agent_session node)", () => {
	test("maps a session id to deterministic graph.create args", () => {
		const input = sessionEntityEnsureInput(
			"11111111-2222-3333-4444-555555555555",
			"Refactor auth",
		);
		expect(input.kind).toBe("agent_session");
		expect(input.title).toBe("Refactor auth");
		expect(input.slug).toBe(
			"chat-session-11111111-2222-3333-4444-555555555555",
		);
		expect(input.sourceRef).toEqual({
			conversationId: "11111111-2222-3333-4444-555555555555",
		});
		// Deterministic idempotency key => replay-safe ensure (no slug collision).
		expect(input.idempotencyKey).toBe(
			sessionEntityIdempotencyKey("11111111-2222-3333-4444-555555555555"),
		);
	});

	test("slug is kebab-case lowercased (passes knowledgeSlugSchema)", () => {
		const input = sessionEntityEnsureInput("ABC-DEF");
		expect(input.slug).toBe("chat-session-abc-def");
		expect(input.slug).toMatch(/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/);
	});

	test("falls back to a derived title when none/blank is given", () => {
		expect(sessionEntityEnsureInput("abcdef12-0000", "  ").title).toBe(
			"Сессия abcdef12",
		);
		expect(sessionEntityEnsureInput("abcdef12-0000", null).title).toBe(
			"Сессия abcdef12",
		);
	});

	test("clamps an overlong title to 300 chars (graphCreateSchema max)", () => {
		const input = sessionEntityEnsureInput("s1", "x".repeat(500));
		expect(input.title.length).toBe(300);
	});

	test("sessionEntitySlug is the single source of the addressable slug", () => {
		expect(sessionEntitySlug("Sess-1")).toBe("chat-session-sess-1");
	});
});

describe("sessionLinkInput (graph.link args)", () => {
	test("relations are exactly about | references", () => {
		expect([...SESSION_LINK_RELATIONS]).toEqual(["about", "references"]);
		expect(isSessionLinkRelation("about")).toBe(true);
		expect(isSessionLinkRelation("references")).toBe(true);
		expect(isSessionLinkRelation("links_to")).toBe(false);
		expect(sessionLinkRelationLabel("about")).toBe("по теме");
		expect(sessionLinkRelationLabel("references")).toBe("ссылается на");
	});

	test("maps session node + target + relation to link args (by entity id)", () => {
		const out = sessionLinkInput({
			sessionEntityId: "src-entity",
			target: { entityId: "tgt-entity", slug: "my-task" },
			relation: "about",
			idempotencyKey: "idem-1",
		});
		expect(out).toEqual({
			idempotencyKey: "idem-1",
			sourceEntityId: "src-entity",
			targetEntityId: "tgt-entity",
			relation: "about",
		});
	});

	test("references relation flows through unchanged", () => {
		const out = sessionLinkInput({
			sessionEntityId: "s",
			target: { entityId: "t" },
			relation: "references",
			idempotencyKey: "k",
		});
		expect(out.relation).toBe("references");
		expect(out.targetEntityId).toBe("t");
	});
});

describe("mapSessionLinks (graph.neighbors -> readout rows)", () => {
	const sessionEntityId = "session-node";

	test("keeps only OUTGOING edges from the session, joined to target nodes", () => {
		const result: NeighborsResultSlice = {
			nodes: [
				{
					entityId: sessionEntityId,
					kind: "agent_session",
					title: "My session",
					slug: "chat-session-x",
				},
				{
					entityId: "task-1",
					kind: "task",
					title: "Ship feature",
					slug: "ship-feature",
				},
				{ entityId: "note-1", kind: "note", title: "Spec", slug: null },
			],
			edges: [
				{
					id: "e1",
					sourceEntityId: sessionEntityId,
					targetEntityId: "task-1",
					relation: "about",
				},
				{
					id: "e2",
					sourceEntityId: sessionEntityId,
					targetEntityId: "note-1",
					relation: "references",
				},
				// Incoming edge (someone links TO the session) — must be dropped.
				{
					id: "e3",
					sourceEntityId: "task-1",
					targetEntityId: sessionEntityId,
					relation: "about",
				},
			],
		};

		const rows = mapSessionLinks(sessionEntityId, result);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			edgeId: "e1",
			relation: "about",
			relationLabel: "по теме",
			targetEntityId: "task-1",
			targetKind: "task",
			targetTitle: "Ship feature",
			targetSlug: "ship-feature",
		});
		expect(rows[1].targetEntityId).toBe("note-1");
		expect(rows[1].targetTitle).toBe("Spec");
		expect(rows[1].targetSlug).toBeNull();
	});

	test("drops self-edges and unresolved (null target) edges", () => {
		const result: NeighborsResultSlice = {
			nodes: [
				{
					entityId: sessionEntityId,
					kind: "agent_session",
					title: "S",
					slug: null,
				},
			],
			edges: [
				{
					id: "self",
					sourceEntityId: sessionEntityId,
					targetEntityId: sessionEntityId,
					relation: "about",
				},
				{
					id: "unresolved",
					sourceEntityId: sessionEntityId,
					targetEntityId: null,
					relation: "references",
				},
			],
		};
		expect(mapSessionLinks(sessionEntityId, result)).toEqual([]);
	});

	test("falls back to the target id as title when the node is absent from the result", () => {
		const result: NeighborsResultSlice = {
			nodes: [],
			edges: [
				{
					id: "e1",
					sourceEntityId: sessionEntityId,
					targetEntityId: "orphan",
					relation: "about",
				},
			],
		};
		const [row] = mapSessionLinks(sessionEntityId, result);
		expect(row.targetTitle).toBe("orphan");
		expect(row.targetKind).toBeNull();
	});

	test("empty result yields no rows", () => {
		expect(mapSessionLinks(sessionEntityId, { nodes: [], edges: [] })).toEqual(
			[],
		);
	});
});
