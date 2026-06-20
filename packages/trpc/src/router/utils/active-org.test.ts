import { beforeEach, describe, expect, mock, test } from "bun:test";

// active-org helpers gate on org membership only — the Stripe `subscription`
// join was removed with #70. These tests assert the surviving helpers work with
// no subscription anywhere in the path.

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));

mock.module("../integration/utils", () => ({
	verifyOrgMembership: verifyOrgMembershipMock,
}));

const { requireActiveOrgId, requireActiveOrgMembership } = await import(
	"./active-org"
);

type Ctx = {
	session: { user: { id: string } };
	activeOrganizationId: string | null;
};

function ctx(orgId: string | null): Ctx {
	return { session: { user: { id: "user-1" } }, activeOrganizationId: orgId };
}

describe("requireActiveOrgId", () => {
	beforeEach(() => verifyOrgMembershipMock.mockClear());

	test("returns the active org id when present", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
		expect(requireActiveOrgId(ctx("org-1") as any)).toBe("org-1");
	});

	test("throws FORBIDDEN when there is no active org", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
		expect(() => requireActiveOrgId(ctx(null) as any)).toThrow();
	});
});

describe("requireActiveOrgMembership", () => {
	beforeEach(() => verifyOrgMembershipMock.mockClear());

	test("verifies membership and returns the org id (no subscription join)", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
		const orgId = await requireActiveOrgMembership(ctx("org-9") as any);
		expect(orgId).toBe("org-9");
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
		expect(verifyOrgMembershipMock).toHaveBeenCalledWith("user-1", "org-9");
	});

	test("there is no subscription-aware variant exported anymore", async () => {
		const mod = (await import("./active-org")) as Record<string, unknown>;
		expect(mod.requireActiveOrgMembershipWithSubscription).toBeUndefined();
	});
});
