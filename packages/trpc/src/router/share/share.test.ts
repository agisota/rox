import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { dbSchemaMockBase } from "../../test-support/dbSchemaMock";
import { drizzleOrmMockBase } from "../../test-support/drizzleOrmMock";

const getCurrentTxidMock = mock(async () => 123);

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));

let accessGrantsFindManyResults: unknown[][] = [];
let txInsertReturningResults: unknown[][] = [];
let txDeleteReturningResults: unknown[][] = [];

const accessGrantsFindMany = mock(
	async () => accessGrantsFindManyResults.shift() ?? [],
);

const txInsertReturning = mock(
	async () => txInsertReturningResults.shift() ?? [],
);
const txInsertOnConflict = mock(() => ({ returning: txInsertReturning }));
const txInsertValues = mock(() => ({ onConflictDoUpdate: txInsertOnConflict }));
const txInsert = mock(() => ({ values: txInsertValues }));

const txDeleteReturning = mock(
	async () => txDeleteReturningResults.shift() ?? [],
);
const txDeleteWhere = mock(() => ({ returning: txDeleteReturning }));
const txDelete = mock(() => ({ where: txDeleteWhere }));

const tx = { insert: txInsert, delete: txDelete };
const transactionMock = mock(async (cb: (tx: unknown) => unknown) => cb(tx));

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			accessGrants: { findMany: accessGrantsFindMany },
			members: { findFirst: mock(async () => null) },
		},
	},
	dbWs: {
		transaction: transactionMock,
	},
}));

mock.module("@rox/db/schema", () => ({
	...dbSchemaMockBase,
	accessGrants: {
		id: "access_grants.id",
		organizationId: "access_grants.organization_id",
		resourceType: "access_grants.resource_type",
		resourceId: "access_grants.resource_id",
		granteeType: "access_grants.grantee_type",
		granteeId: "access_grants.grantee_id",
		role: "access_grants.role",
		createdAt: "access_grants.created_at",
	},
	members: { userId: "members.user_id", organizationId: "members.org_id" },
}));

mock.module("@rox/db/utils", () => ({
	getCurrentTxid: getCurrentTxidMock,
}));

const verifyOrgMembershipWithSubscriptionMock = mock(async () => ({
	membership: { role: "owner" },
	subscription: null,
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: verifyOrgMembershipWithSubscriptionMock,
}));

mock.module("drizzle-orm", () => ({ ...drizzleOrmMockBase }));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { shareRouter } = await import("./share");

const createCaller = createCallerFactory(
	createTRPCRouter({
		share: shareRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_ID = "44444444-4444-4444-8444-444444444444";
const GRANTEE_ID = "55555555-5555-4555-8555-555555555555";
const GRANT_ID = "66666666-6666-4666-8666-666666666666";

function authedContext(
	overrides: { activeOrganizationId?: string | null } = {},
) {
	const activeOrganizationId =
		overrides.activeOrganizationId === undefined
			? ORG_ID
			: overrides.activeOrganizationId;
	return {
		session: {
			user: { id: USER_ID, email: "u@example.com" },
			session: { activeOrganizationId },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

beforeEach(() => {
	accessGrantsFindManyResults = [];
	txInsertReturningResults = [];
	txDeleteReturningResults = [];

	accessGrantsFindMany.mockClear();
	txInsert.mockClear();
	txInsertValues.mockClear();
	txInsertOnConflict.mockClear();
	txInsertReturning.mockClear();
	txDelete.mockClear();
	txDeleteWhere.mockClear();
	txDeleteReturning.mockClear();
	transactionMock.mockClear();

	getCurrentTxidMock.mockReset();
	getCurrentTxidMock.mockImplementation(async () => 123);

	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
	verifyOrgAdminMock.mockReset();
	verifyOrgAdminMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
});

describe("share.grant", () => {
	it("upserts an access grant and returns id + txid", async () => {
		txInsertReturningResults.push([{ id: GRANT_ID }]);
		const caller = createCaller(authedContext());

		const result = await caller.share.grant({
			resourceType: "project",
			resourceId: RESOURCE_ID,
			granteeType: "team",
			granteeId: GRANTEE_ID,
			role: "editor",
		});

		expect(result).toEqual({ id: GRANT_ID, txid: 123 });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
		expect(txInsertOnConflict).toHaveBeenCalledTimes(1);
	});

	it("rejects an invalid role", async () => {
		const caller = createCaller(authedContext());
		await expect(
			caller.share.grant({
				resourceType: "project",
				resourceId: RESOURCE_ID,
				granteeType: "team",
				granteeId: GRANTEE_ID,
				// @ts-expect-error invalid role for the test
				role: "superadmin",
			}),
		).rejects.toBeInstanceOf(TRPCError);
	});
});

describe("share.revoke", () => {
	it("deletes a grant and returns txid", async () => {
		txDeleteReturningResults.push([{ id: GRANT_ID }]);
		const caller = createCaller(authedContext());

		const result = await caller.share.revoke({ id: GRANT_ID });

		expect(result).toEqual({ success: true, txid: 123 });
		expect(txDeleteWhere).toHaveBeenCalledTimes(1);
	});

	it("throws NOT_FOUND when no grant is deleted", async () => {
		txDeleteReturningResults.push([]);
		const caller = createCaller(authedContext());

		await expect(caller.share.revoke({ id: GRANT_ID })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("share.list", () => {
	it("returns grants for the active org", async () => {
		const rows = [{ id: GRANT_ID, organizationId: ORG_ID }];
		accessGrantsFindManyResults.push(rows);
		const caller = createCaller(authedContext());

		const result = await caller.share.list({ resourceType: "project" });

		expect(result).toEqual(rows);
		expect(accessGrantsFindMany).toHaveBeenCalledTimes(1);
	});
});
