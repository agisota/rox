import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The issue-board surface MUST be inert when the gate is closed (no active org):
 * it renders the "unavailable" fallback, never the board panel — so it never
 * issues org-less `task.list` / `task.statuses.list` / `graph.projectGraph`
 * calls. The auth/env/tRPC modules are module-mocked only to satisfy import-time
 * singletons (the panel pulls the validated web `env` through `@/trpc/react`);
 * the assertion exercises the gate via the (absent) active org. Mocks are
 * restored after the suite so sibling web suites are unaffected.
 */
mock.module("@rox/auth/client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
mock.module("@/env", () => ({
	env: { NODE_ENV: "test" },
}));
mock.module("@/trpc/react", () => ({
	useTRPC: () => ({
		v2Project: { list: { queryOptions: () => ({ queryKey: [] }) } },
		task: {
			statuses: { list: { queryOptions: () => ({ queryKey: [] }) } },
			list: { queryOptions: () => ({ queryKey: [] }) },
		},
		graph: { projectGraph: { queryOptions: () => ({ queryKey: [] }) } },
	}),
}));

const { IssueBoardGateClient } = await import("./IssueBoardGateClient");

afterAll(() => {
	mock.restore();
});

describe("IssueBoardGateClient", () => {
	test("renders the fallback (not the board) when there is no active org", () => {
		const html = renderToStaticMarkup(<IssueBoardGateClient />);
		expect(html).toContain("Доска задач недоступна");
		// The board panel's heading must not be present when the gate is closed.
		expect(html).not.toContain("Задачи проекта по колонкам статусов");
	});
});
