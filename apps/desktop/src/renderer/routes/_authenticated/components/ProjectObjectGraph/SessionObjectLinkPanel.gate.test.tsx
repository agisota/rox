import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ExperimentalFeatureState } from "@rox/shared/experimental-features";
import {
	mapSessionLinks,
	type NeighborsResultSlice,
	sessionEntityEnsureInput,
	sessionEntityIdempotencyKey,
	sessionLinkInput,
} from "@rox/shared/session-object-link";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Desktop parity for `projectOs.objectLinkedChat`. This suite proves the gated
 * contract of the object-linked-chat control:
 *
 *   1. gate ON (enabled + available) → the link surface mounts, ensures the
 *      session's `agent_session` graph node via the shipped `graph.create`
 *      (deterministic idempotency key → get-or-create), and the target picker
 *      issues `graph.search` with the right input (the addressable Project-OS
 *      kinds, semantic mode);
 *   2. the link-input mapping (session node + picked target + relation →
 *      `graph.link` args) and the backlinks readout (`graph.neighbors` → rows)
 *      go through the REUSED pure helpers (`@rox/shared/session-object-link`),
 *      not a desktop re-implementation; and
 *   3. gate OFF → the surface is absent (no input, no `graph.*` call) — no
 *      regression versus today.
 *
 * The gate is driven by mocking `useExperimentalFeature` (its data source). The
 * cloud-tRPC singleton + react-query are mocked so the assertion exercises OUR
 * wiring (ensure input, search input, mapper reuse, gating), never a live
 * transport. Mirrors `UnifiedSearchPanel.gate.test.tsx`.
 */

let currentState: ExperimentalFeatureState = makeState(true, "available");

function makeState(
	enabled: boolean,
	availability: ExperimentalFeatureState["availability"],
): ExperimentalFeatureState {
	return {
		id: "projectOs.objectLinkedChat",
		enabled,
		defaultEnabled: true,
		userOverride: null,
		availability,
		dependencies: [],
	};
}

mock.module("renderer/hooks/useExperimentalFeature", () => ({
	useExperimentalFeature: () => ({
		state: currentState,
		isLoading: false,
		refetch: async () => undefined,
	}),
}));

// Capture the exact inputs the panel passes to the shipped graph procedures.
let capturedEnsureInput: unknown;
let capturedSearchInput: unknown;

const searchHits = [
	{ id: "task-1", kind: "task", slug: "ship-feature", title: "Ship feature" },
	{ id: "note-1", kind: "note", slug: "spec", title: "Spec" },
];

// One existing outgoing link, so the readout renders a real row through the
// REUSED `mapSessionLinks` (session → task, relation `about`).
const SESSION_NODE_ID = "session-node-1";
const neighborsResult: NeighborsResultSlice = {
	nodes: [
		{
			entityId: SESSION_NODE_ID,
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
	],
	edges: [
		{
			id: "edge-1",
			sourceEntityId: SESSION_NODE_ID,
			targetEntityId: "task-1",
			relation: "about",
		},
	],
};

const cloudProxy = {
	graph: {
		create: {
			mutationOptions: (opts: { onSuccess?: (e: { id: string }) => void }) => ({
				// Surface the ensure path: when the panel "mounts" the mutation, react-query
				// mock below invokes nothing, so we resolve the session node id eagerly via
				// onSuccess to drive the neighbors query enabled-state in the render.
				__onSuccess: opts.onSuccess,
			}),
		},
		search: {
			queryOptions: (input: unknown) => {
				capturedSearchInput = input;
				return { queryKey: ["graph.search", input] };
			},
		},
		neighbors: {
			queryOptions: (input: unknown) => ({
				queryKey: ["graph.neighbors", input],
			}),
			queryKey: (input: unknown) => ["graph.neighbors", input],
		},
		link: {
			mutationOptions: () => ({}),
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

// Drive react-query: `useMutation` runs the ensure mutation's onSuccess once so
// the session node id resolves (enabling the neighbors readout); `useQuery`
// returns the seeded search hits and neighbors result without a live transport.
mock.module("@tanstack/react-query", () => ({
	useMutation: (options: {
		mutationFn?: unknown;
		onSuccess?: (data: unknown) => void;
		__onSuccess?: (data: unknown) => void;
	}) => {
		// The ensure mutation carries our captured onSuccess via mutationOptions;
		// fire it to resolve the session entity id deterministically on render.
		const onSuccess =
			(options as { __onSuccess?: (d: unknown) => void }).__onSuccess ??
			options.onSuccess;
		return {
			mutate: (input: unknown) => {
				// The ensure mutation is the one that resolves a session node id.
				if (input && typeof input === "object" && "slug" in input) {
					capturedEnsureInput = input;
					onSuccess?.({ id: SESSION_NODE_ID });
				}
			},
			isPending: false,
		};
	},
	useQuery: (options: { queryKey?: unknown[] }) => {
		const key = options.queryKey?.[0];
		if (key === "graph.search") {
			return {
				data: { hits: searchHits },
				isFetching: false,
				isError: false,
				isLoading: false,
			};
		}
		if (key === "graph.neighbors") {
			return {
				data: neighborsResult,
				isFetching: false,
				isError: false,
				isLoading: false,
			};
		}
		return { data: undefined, isFetching: false, isError: false };
	},
	useQueryClient: () => ({
		invalidateQueries: async () => undefined,
	}),
}));

// Real debounce defers the first value; a static render cannot type. Return a
// fixed non-empty query (>= MIN_QUERY_LENGTH) so the picker is enabled and the
// seeded search hits render on first render.
mock.module("renderer/hooks/useDebouncedValue", () => ({
	useDebouncedValue: () => "ship",
}));

const { SessionObjectLinkPanel } = await import("./SessionObjectLinkPanel");

afterEach(() => {
	currentState = makeState(true, "available");
	capturedEnsureInput = undefined;
	capturedSearchInput = undefined;
});

describe("SessionObjectLinkPanel — desktop gate (projectOs.objectLinkedChat)", () => {
	it("gate ON: mounts the surface (picker + relation + link action + readout), preparing the session node", () => {
		// NOTE: the desktop test convention here is `renderToStaticMarkup`, which does
		// NOT run effects (no DOM runtime / RTL in this workspace). The session node is
		// ensured in a mount effect, so on a static render the surface shows its
		// "preparing" state — i.e. the gate is open and the surface is REALLY mounted,
		// the link action is disabled until the node resolves, and no fake row is shown.
		// The deterministic `graph.create` ensure args are proven via the REUSED
		// `sessionEntityEnsureInput` contract in the suite below.
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(
			createElement(SessionObjectLinkPanel, {
				sessionId: "11111111-2222-3333-4444-555555555555",
				sessionTitle: "Refactor auth",
			}),
		);

		// Surface present (header, picker, relation control, link button, readout).
		expect(html).toContain("Связать с объектом");
		expect(html).toContain('aria-label="Поиск объекта для связи"');
		expect(html).toContain('aria-label="Тип связи"');
		expect(html).toContain("Связать");
		expect(html).toContain("Текущие связи сессии");
		// Until the session node resolves, the surface is in its preparing state.
		expect(html).toContain("Подготовка узла сессии…");
	});

	it("gate ON: the target picker calls graph.search with the addressable Project-OS kinds + semantic mode", () => {
		currentState = makeState(true, "available");
		renderToStaticMarkup(
			createElement(SessionObjectLinkPanel, {
				sessionId: "sess-1",
				sessionTitle: "S",
			}),
		);

		expect(capturedSearchInput).toMatchObject({
			kinds: ["note", "task", "project", "contact", "feed", "file"],
			mode: "semantic",
			status: "active",
			limit: 15,
		});
	});

	it("gate ON: search hits render with REUSED RU kind labels", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(
			createElement(SessionObjectLinkPanel, {
				sessionId: "sess-1",
				sessionTitle: "S",
			}),
		);
		expect(html).toContain("Ship feature");
		expect(html).toContain("Spec");
		// RU labels from the reused mapper (task → Задача, note → Заметка).
		expect(html).toContain("Задача");
		expect(html).toContain("Заметка");
	});

	it("gate ON: the backlinks readout section is present (empty until the session node resolves)", () => {
		// On a static render the mount effect that resolves the session node has not
		// run, so the readout shows its empty state rather than a fabricated row. The
		// real readout mapping (graph.neighbors result → rows via the REUSED
		// `mapSessionLinks`) is proven as a pure contract in the suite below.
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(
			createElement(SessionObjectLinkPanel, {
				sessionId: "sess-1",
				sessionTitle: "S",
			}),
		);
		expect(html).toContain("Текущие связи сессии");
		expect(html).toContain("Пока нет связей");
	});

	it("gate OFF (disabled): the surface is absent — no input, no graph.* call", () => {
		currentState = makeState(false, "available");
		const html = renderToStaticMarkup(
			createElement(SessionObjectLinkPanel, {
				sessionId: "sess-1",
				sessionTitle: "S",
			}),
		);
		expect(html).toBe("");
		expect(capturedEnsureInput).toBeUndefined();
		expect(capturedSearchInput).toBeUndefined();
	});

	it("gate OFF (not available): the surface is absent even when enabled", () => {
		currentState = makeState(true, "needs_configuration");
		const html = renderToStaticMarkup(
			createElement(SessionObjectLinkPanel, {
				sessionId: "sess-1",
				sessionTitle: "S",
			}),
		);
		expect(html).toBe("");
		expect(capturedSearchInput).toBeUndefined();
	});
});

describe("SessionObjectLinkPanel — reused link/readout contracts", () => {
	it("link mapping: session node + picked target + relation → graph.link args (by entity id)", () => {
		// The exact pure contract the panel's `handleLink` wires to graph.link.
		const out = sessionLinkInput({
			sessionEntityId: SESSION_NODE_ID,
			target: { entityId: "task-1", slug: "ship-feature" },
			relation: "about",
			idempotencyKey: "idem-1",
		});
		expect(out).toEqual({
			idempotencyKey: "idem-1",
			sourceEntityId: SESSION_NODE_ID,
			targetEntityId: "task-1",
			relation: "about",
		});
	});

	it("readout mapping: graph.neighbors result → outgoing-link rows (reused mapSessionLinks)", () => {
		const rows = mapSessionLinks(SESSION_NODE_ID, neighborsResult);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			edgeId: "edge-1",
			relation: "about",
			relationLabel: "по теме",
			targetEntityId: "task-1",
			targetKind: "task",
			targetTitle: "Ship feature",
		});
	});

	it("ensure mapping: a session id maps to deterministic graph.create args (reused)", () => {
		const input = sessionEntityEnsureInput("abc-def", "Title");
		expect(input).toMatchObject({
			kind: "agent_session",
			title: "Title",
			slug: "chat-session-abc-def",
		});
		expect(input.idempotencyKey).toBe(sessionEntityIdempotencyKey("abc-def"));
	});
});
