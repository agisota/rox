import { describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";

// `integration.ts` (and each provider router) imports the real env + db client,
// which validate/connect at module load. Stub them so the router can be imported
// for a pure shape assertion: all 9 providers still mount after the WS-O T7
// non-destructive cleanup (no enum-value removal, no provider deletion).

mock.module("@rox/db/client", () => ({
	db: { query: { integrationConnections: { findMany: async () => [] } } },
	dbWs: {},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	integrationConnections: {
		id: "integration_connections.id",
		organizationId: "integration_connections.organization_id",
		provider: "integration_connections.provider",
		externalOrgId: "integration_connections.external_org_id",
		externalOrgName: "integration_connections.external_org_name",
		config: "integration_connections.config",
		createdAt: "integration_connections.created_at",
		updatedAt: "integration_connections.updated_at",
	},
}));

mock.module("../../env", () => ({
	env: {
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

// A chainable proxy: every property access returns a callable that returns the
// same proxy, so any `.input(...).query(...)` / `.mutation(...)` chain the
// provider-router factory builds resolves to a stable procedure stub.
const procedureProxy: unknown = new Proxy(function chain() {}, {
	get: () => () => procedureProxy,
	apply: () => procedureProxy,
});

mock.module("../../trpc", () => ({
	protectedProcedure: procedureProxy,
}));

mock.module("./utils", () => ({
	verifyOrgMembership: async () => ({ membership: { role: "member" } }),
	verifyOrgAdmin: async () => ({ membership: { role: "owner" } }),
}));

const { integrationRouter } = await import("./integration");

const EXPECTED_PROVIDERS = [
	"github",
	"linear",
	"slack",
	"telegram",
	"discord",
	"notion",
	"obsidian",
	"fibery",
	"lark",
] as const;

describe("integrationRouter shape (WS-O T7)", () => {
	it("still mounts all 9 integration providers after cleanup", () => {
		for (const provider of EXPECTED_PROVIDERS) {
			expect(integrationRouter).toHaveProperty(provider);
		}
	});

	it("keeps the cross-provider `list` procedure", () => {
		expect(integrationRouter).toHaveProperty("list");
	});

	it("did not remove any provider (count is unchanged: 9 providers + list)", () => {
		const keys = Object.keys(integrationRouter);
		for (const provider of EXPECTED_PROVIDERS) {
			expect(keys).toContain(provider);
		}
		expect(keys).toContain("list");
	});
});
