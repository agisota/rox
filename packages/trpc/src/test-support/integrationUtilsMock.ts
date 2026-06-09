/**
 * Shared base stub for `mock.module("../integration/utils", …)` in router unit
 * tests.
 *
 * Same Bun global-mock-pollution hazard as {@link dbSchemaMockBase} /
 * {@link drizzleOrmMockBase}: router tests mock `../integration/utils` with
 * different `verify*` subsets, so the last-registered mock (order-dependent,
 * differs between machines/CI) is what every router's static
 * `import { verifyOrg… } from "../integration/utils"` links against. A lean mock
 * (e.g. one omitting `verifyOrgOwner`) breaks linking of routers that import it
 * (`project`, `v2-project`) with "Export named 'verifyOrgOwner' not found".
 *
 * Spreading this base guarantees all four guard names are always present. Each
 * test still overrides the specific guards it configures/asserts on (with real
 * `bun:test` mocks); these plain defaults only satisfy linking for guards a
 * given test never exercises — so this module stays free of a `bun:test`
 * import and typechecks as ordinary source.
 */
export const integrationUtilsMockBase = {
	verifyOrgAdmin: async () => ({ membership: { role: "owner" } }),
	verifyOrgOwner: async () => ({ membership: { role: "owner" } }),
	verifyOrgMembership: async () => ({ membership: { role: "owner" } }),
	verifyOrgMembershipWithSubscription: async () => ({
		membership: { role: "owner" },
		subscription: null,
	}),
};
