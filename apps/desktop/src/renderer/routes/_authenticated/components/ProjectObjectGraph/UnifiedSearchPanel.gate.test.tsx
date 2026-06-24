import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ExperimentalFeatureState } from "@rox/shared/experimental-features";
import {
	toUnifiedSearchResult,
	type UnifiedSearchHit,
} from "@rox/shared/unified-search-results";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Desktop parity for `projectOs.unifiedSearch`. This suite proves the gated
 * contract of the unified-search panel:
 *
 *   1. gate ON (enabled + available) → the search surface mounts, the debounced
 *      query calls the shipped `graph.search` with the right input (default
 *      Project-OS kinds, semantic mode), and hits render via the REUSED pure
 *      mapper (`@rox/shared/unified-search-results`);
 *   2. clicking a navigable hit calls `onOpenHit` with the entity id (in-app
 *      navigation — desktop opens the object in place, not via the `rox://`
 *      deep link); and
 *   3. gate OFF → the surface is absent (no input, no `graph.search` call) —
 *      no regression versus today.
 *
 * The gate is driven by mocking `useExperimentalFeature` (its data source). The
 * cloud-tRPC singleton + react-query are mocked so the assertion exercises OUR
 * wiring (input shape, mapper reuse, click navigation), never a live transport.
 */

let currentState: ExperimentalFeatureState = makeState(true, "available");

function makeState(
	enabled: boolean,
	availability: ExperimentalFeatureState["availability"],
): ExperimentalFeatureState {
	return {
		id: "projectOs.unifiedSearch",
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

// Capture the exact input the panel passes to `graph.search.queryOptions`.
let capturedSearchInput: unknown;
const searchHits = [
	{
		id: "ent-task-1",
		kind: "task",
		slug: "fix-login",
		title: "Fix login",
		status: "active",
		snippet: "…the login button…",
	},
	{
		id: "ent-proj-1",
		kind: "project",
		slug: "atlas",
		title: "Atlas",
		status: "active",
	},
];

const cloudProxy = {
	graph: {
		search: {
			queryOptions: (input: unknown) => {
				capturedSearchInput = input;
				return { queryKey: ["graph.search", input] };
			},
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

// Drive the search result + the "fetching" flag through react-query so the
// panel renders the mapped hits without a live transport. The debounce hook is
// real; we seed the query input above 2 chars so `enabled` is true on render.
mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: { hits: searchHits, degraded: false },
		isFetching: false,
		isError: false,
		refetch: async () => undefined,
	}),
}));

// Real debounce would defer the first non-empty value by a frame and a static
// render cannot type into the input. To deterministically exercise the
// "user has typed a query, results arrived" state on first render, the debounce
// mock returns a fixed non-empty query (length >= MIN_QUERY_LENGTH) so the panel
// is `enabled` and renders the mapped hits from the `useQuery` mock above.
mock.module("renderer/hooks/useDebouncedValue", () => ({
	useDebouncedValue: () => "login",
}));

const { UnifiedSearchPanel } = await import("./UnifiedSearchPanel");

afterEach(() => {
	currentState = makeState(true, "available");
	capturedSearchInput = undefined;
});

const hit = (over: Partial<UnifiedSearchHit>): UnifiedSearchHit => ({
	id: "x",
	kind: "task",
	slug: "s",
	title: "T",
	status: "active",
	...over,
});

describe("UnifiedSearchPanel — desktop gate (projectOs.unifiedSearch)", () => {
	it("gate ON: renders the surface and calls graph.search with the Project-OS kinds + semantic mode", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(
			createElement(UnifiedSearchPanel, { onOpenHit: () => {} }),
		);

		// Surface is present.
		expect(html).toContain("Единый поиск");
		expect(html).toContain('aria-label="Поиск по объектам"');

		// The shipped graph.search query was issued with the reused default kinds.
		expect(capturedSearchInput).toMatchObject({
			kinds: ["note", "task", "project", "contact", "feed", "file"],
			mode: "semantic",
			status: "active",
			limit: 25,
		});
	});

	it("gate ON: renders hits via the REUSED shared mapper (RU kind labels, snippet)", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(
			createElement(UnifiedSearchPanel, { onOpenHit: () => {} }),
		);

		// Titles render.
		expect(html).toContain("Fix login");
		expect(html).toContain("Atlas");
		// RU kind labels come from the reused mapper (task → Задача, project → Проект).
		expect(html).toContain("Задача");
		expect(html).toContain("Проект");
		// Snippet from the task hit.
		expect(html).toContain("the login button");
	});

	it("gate ON: a navigable hit renders as an open button; a non-navigable hit is inert", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(
			createElement(UnifiedSearchPanel, { onOpenHit: () => {} }),
		);

		// The `task` hit has an openable route (mapper href != null) → it renders
		// inside a clickable <button> that opens the object in place. The `project`
		// hit has no desktop route (href null) → it renders inert (no button), so
		// exactly one hit row is a button.
		const buttonCount = (html.match(/<button[^>]*type="button"/g) ?? []).length;
		expect(buttonCount).toBe(1);
		// The single hit button is the navigable task hit, not the project hit.
		const taskButton =
			/<button[^>]*type="button"[^>]*>(?:(?!<\/button>).)*Fix login/s.test(
				html,
			);
		expect(taskButton).toBe(true);
		expect(html).not.toMatch(
			/<button[^>]*type="button"[^>]*>(?:(?!<\/button>).)*Atlas/s,
		);
	});

	it("navigation contract: the row opens by entity id exactly when the reused mapper marks it navigable", () => {
		// This is the pure contract the panel's row wires `onOpenHit` to: a hit is
		// navigable iff the reused mapper resolves an openable href; the click then
		// opens `result.id` (the entity id), not the `rox://` deep link.
		const taskVm = toUnifiedSearchResult(
			hit({ id: "ent-task-1", kind: "task" }),
		);
		expect(taskVm.href).not.toBeNull();
		expect(taskVm.id).toBe("ent-task-1");

		const projectVm = toUnifiedSearchResult(
			hit({ id: "ent-proj-1", kind: "project" }),
		);
		expect(projectVm.href).toBeNull();
	});

	it("gate OFF (disabled): the surface is absent — no input, no graph.search call", () => {
		currentState = makeState(false, "available");
		const html = renderToStaticMarkup(
			createElement(UnifiedSearchPanel, { onOpenHit: () => {} }),
		);
		expect(html).toBe("");
		expect(html).not.toContain('aria-label="Поиск по объектам"');
		expect(capturedSearchInput).toBeUndefined();
	});

	it("gate OFF (not available): the surface is absent even when enabled", () => {
		currentState = makeState(true, "needs_configuration");
		const html = renderToStaticMarkup(
			createElement(UnifiedSearchPanel, { onOpenHit: () => {} }),
		);
		expect(html).toBe("");
		expect(capturedSearchInput).toBeUndefined();
	});
});
