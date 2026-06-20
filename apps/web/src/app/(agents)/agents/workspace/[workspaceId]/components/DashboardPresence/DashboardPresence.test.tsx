import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * WS-L T10 — the mount MUST be inert by default. With no LiveBlocks public key
 * (the rollout default) it renders nothing: no provider, no network, no DOM.
 * That contract lets it land on the dashboard surface before keys exist without
 * affecting existing builds.
 *
 * The env / auth / tRPC modules are mocked only to satisfy import resolution
 * (they are import-time singletons); the actual gate inputs are injected via
 * props so the assertion exercises the gate, not the singletons. Mocks are
 * restored after the suite so sibling web suites are unaffected.
 */
mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY: undefined },
}));
mock.module("@rox/auth/client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
mock.module("@/trpc/client", () => ({
	trpcClient: {
		collab: { authRoom: { mutate: async () => ({ token: "t" }) } },
	},
}));

const { DashboardPresence } = await import("./DashboardPresence");

afterAll(() => {
	mock.restore();
});

describe("DashboardPresence", () => {
	test("renders nothing (inert) when the LiveBlocks public key is unset", () => {
		const html = renderToStaticMarkup(
			<DashboardPresence
				dashboardId="ws_1"
				organizationId="org_1"
				publicKey={undefined}
			/>,
		);

		expect(html).toBe("");
	});

	test("stays inert when an org is present but no public key is configured", () => {
		const html = renderToStaticMarkup(
			<DashboardPresence dashboardId="ws_1" organizationId="org_1" />,
		);

		expect(html).toBe("");
	});
});
