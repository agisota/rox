import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The object-comments surface MUST be inert when the gate is closed (no active
 * org): it renders the "unavailable" fallback, never the comments panel — so it
 * never issues an org-less `graph.comments` call. The auth/env/tRPC modules are
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
			comments: {
				list: {
					queryOptions: () => ({ queryKey: [], queryFn: async () => [] }),
					queryKey: () => [],
				},
				create: {
					mutationOptions: () => ({}),
				},
			},
		},
	}),
}));

const { ObjectCommentsGateClient } = await import("./ObjectCommentsGateClient");

afterAll(() => {
	mock.restore();
});

describe("ObjectCommentsGateClient", () => {
	test("renders the fallback (not the panel) when there is no active org", () => {
		const html = renderToStaticMarkup(
			<ObjectCommentsGateClient entityId="11111111-1111-1111-1111-111111111111" />,
		);
		expect(html).toContain("Комментарии недоступны");
		// The panel's compose box must not be present when the gate is closed.
		expect(html).not.toContain("Добавить комментарий");
	});
});
