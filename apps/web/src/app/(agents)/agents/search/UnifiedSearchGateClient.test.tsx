import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The unified-search surface MUST be inert when the gate is closed (no active
 * org): it renders the "unavailable" fallback, never the search panel — so it
 * never issues an org-less `graph.search`. The auth/env/tRPC modules are
 * module-mocked only to satisfy import-time singletons (the panel pulls the
 * validated web `env` through `@/trpc/react`); the assertion exercises the gate
 * via the (absent) active org. Mocks are restored after the suite so sibling web
 * suites are unaffected.
 */
mock.module("@rox/auth/client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
mock.module("@/env", () => ({
	env: { NODE_ENV: "test" },
}));
mock.module("@/trpc/react", () => ({
	useTRPC: () => ({
		graph: {
			search: {
				queryOptions: () => ({
					queryKey: [],
					queryFn: async () => ({ hits: [], degraded: false }),
				}),
			},
		},
	}),
}));

const { UnifiedSearchGateClient } = await import("./UnifiedSearchGateClient");

afterAll(() => {
	mock.restore();
});

describe("UnifiedSearchGateClient", () => {
	test("renders the fallback (not the panel) when there is no active org", () => {
		const html = renderToStaticMarkup(<UnifiedSearchGateClient />);
		expect(html).toContain("Единый поиск недоступен");
		// The panel's search input must not be present when the gate is closed.
		expect(html).not.toContain("Поиск по объектам");
	});
});
