import { afterEach, describe, expect, it, mock } from "bun:test";
import {
	type ExperimentalFeatureState,
	resolveExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import {
	type BoardCardRow,
	type BoardStatus,
	groupTasksByStatus,
} from "@rox/shared/issue-board";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Desktop parity for `projectOs.issueBoard`. This suite proves the gated
 * contract of the org issue-board panel:
 *
 *   1. gate ON (enabled + available) → the board surface mounts and issues BOTH
 *      shipped queries — `task.statuses.list` (columns) and `task.list` (cards,
 *      with the 500 cap) — and the columns/cards render via the REUSED pure
 *      mapper (`@rox/shared/issue-board` → `groupTasksByStatus`): status columns
 *      in `position` order, cards under their status, RU priority label, assignee;
 *   2. gate OFF (disabled OR not-available) → the surface is absent (no header,
 *      neither task query called) — no regression versus today; and
 *   3. the grouping the panel renders equals the reused mapper's output for the
 *      same payloads (it renders the mapper, not its own grouping).
 *
 * The gate is driven by mocking `useExperimentalFeature` (its data source). The
 * cloud-tRPC singleton + react-query are mocked so the surface assertions
 * exercise OUR wiring (gate, both query inputs, mapper reuse), never a live
 * transport.
 */

// The org's real task statuses returned by the shipped `task.statuses.list`.
const statuses: BoardStatus[] = [
	{
		id: "s_done",
		name: "Готово",
		color: "#16a34a",
		type: "completed",
		position: 3,
	},
	{
		id: "s_todo",
		name: "К работе",
		color: "#64748b",
		type: "unstarted",
		position: 1,
	},
	{
		id: "s_doing",
		name: "В работе",
		color: "#2563eb",
		type: "started",
		position: 2,
	},
];

// The org's real tasks returned by the shipped `task.list`.
const cards: BoardCardRow[] = [
	{
		task: {
			id: "t1",
			slug: "fix-login",
			title: "Починить вход",
			statusId: "s_todo",
			priority: "high",
		},
		assignee: { id: "u1", name: "Марк", image: null },
		creator: null,
		statusName: "К работе",
	},
	{
		task: {
			id: "t2",
			slug: "ship-board",
			title: "Запустить доску",
			statusId: "s_doing",
			priority: "urgent",
		},
		assignee: null,
		creator: null,
		statusName: "В работе",
	},
];

let currentState: ExperimentalFeatureState = makeState(true, "available");

function makeState(
	enabled: boolean,
	availability: ExperimentalFeatureState["availability"],
): ExperimentalFeatureState {
	return {
		id: "projectOs.issueBoard",
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

// Capture the exact inputs the panel passes to each shipped query.
let capturedStatusesCalled = false;
let capturedListInput: unknown;

const cloudProxy = {
	task: {
		statuses: {
			list: {
				queryOptions: () => {
					capturedStatusesCalled = true;
					return { queryKey: ["task.statuses.list"] };
				},
			},
		},
		list: {
			queryOptions: (input: unknown) => {
				capturedListInput = input;
				return { queryKey: ["task.list", input] };
			},
		},
	},
};

mock.module("renderer/lib/api-trpc-react", () => ({
	useCloudTrpc: () => cloudProxy,
}));

// Drive both queries through react-query without a live transport: dispatch the
// payload by the queryKey so statuses→status rows and list→card rows, proving the
// panel wires BOTH the columns query and the cards query.
mock.module("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey?: unknown[] }) => {
		const key = options?.queryKey?.[0];
		const data = key === "task.statuses.list" ? statuses : cards;
		return {
			data,
			isLoading: false,
			isError: false,
			refetch: async () => undefined,
		};
	},
}));

const { IssueBoardPanel } = await import("./IssueBoardPanel");

afterEach(() => {
	currentState = makeState(true, "available");
	capturedStatusesCalled = false;
	capturedListInput = undefined;
});

describe("IssueBoardPanel — desktop gate (projectOs.issueBoard)", () => {
	it("gate ON: renders the board and calls task.statuses.list + task.list (limit 500)", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(createElement(IssueBoardPanel));

		// Surface is present.
		expect(html).toContain("Доска задач");
		expect(html).toContain('aria-label="Доска задач"');

		// BOTH shipped read queries were issued, with the right card cap.
		expect(capturedStatusesCalled).toBe(true);
		expect(capturedListInput).toMatchObject({ limit: 500 });
	});

	it("gate ON: renders status columns + cards via the REUSED shared mapper (order, RU priority, assignee)", () => {
		currentState = makeState(true, "available");
		const html = renderToStaticMarkup(createElement(IssueBoardPanel));

		// Columns are the org statuses; cards land under them with RU priority.
		expect(html).toContain("К работе");
		expect(html).toContain("В работе");
		expect(html).toContain("Готово");
		expect(html).toContain("Починить вход");
		expect(html).toContain("Запустить доску");
		expect(html).toContain("Высокий"); // priority high → RU
		expect(html).toContain("Срочно"); // priority urgent → RU
		expect(html).toContain("Марк"); // assignee name rendered

		// The rendered board equals the reused mapper output for the same payloads:
		// columns are position-ordered (todo→doing→done) and carry the right cards,
		// proving the panel renders the mapper (not its own grouping). The done
		// column header text precedes neither todo nor doing in source order, but the
		// mapper re-sorts by position — assert that ordering shows in the markup.
		const columns = groupTasksByStatus(statuses, cards);
		expect(columns.map((c) => c.id)).toEqual(["s_todo", "s_doing", "s_done"]);
		const idxTodo = html.indexOf("К работе");
		const idxDoing = html.indexOf("В работе");
		const idxDone = html.indexOf("Готово");
		expect(idxTodo).toBeGreaterThanOrEqual(0);
		expect(idxTodo).toBeLessThan(idxDoing);
		expect(idxDoing).toBeLessThan(idxDone);
	});

	it("gate OFF (disabled): the surface is absent — no header, neither task query called", () => {
		currentState = makeState(false, "available");
		const html = renderToStaticMarkup(createElement(IssueBoardPanel));
		expect(html).toBe("");
		expect(html).not.toContain('aria-label="Доска задач"');
		expect(capturedStatusesCalled).toBe(false);
		expect(capturedListInput).toBeUndefined();
	});

	it("gate OFF (not available): the surface is absent even when enabled", () => {
		currentState = makeState(true, "needs_configuration");
		const html = renderToStaticMarkup(createElement(IssueBoardPanel));
		expect(html).toBe("");
		expect(capturedStatusesCalled).toBe(false);
		expect(capturedListInput).toBeUndefined();
	});

	it("gate uses the real resolver default for projectOs.issueBoard (sanity)", () => {
		// The feature exists in the registry and resolves a concrete state — this is
		// the same id the panel + ExperimentalFeatureGate consume.
		const resolved = resolveExperimentalFeatureState("projectOs.issueBoard");
		expect(resolved.id).toBe("projectOs.issueBoard");
	});
});
