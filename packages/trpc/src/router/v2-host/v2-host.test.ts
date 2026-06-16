import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";

const getCurrentTxidMock = mock(async () => 456);
const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "owner" },
}));

let txInsertReturningResults: unknown[][] = [];
const txInsertReturning = mock(
	async () => txInsertReturningResults.shift() ?? [],
);
const txInsertOnConflictDoNothing = mock(() => ({
	returning: txInsertReturning,
}));
const txInsertValues = mock(() => ({
	onConflictDoNothing: txInsertOnConflictDoNothing,
}));
const txInsert = mock(() => ({ values: txInsertValues }));
const tx = { insert: txInsert };
const transactionMock = mock(async (cb: (tx: unknown) => unknown) => cb(tx));

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			members: {
				findFirst: mock(async () => ({ id: "member-1" })),
			},
		},
	},
	dbWs: {
		transaction: transactionMock,
	},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	members: {
		userId: "members.user_id",
		organizationId: "members.organization_id",
	},
	v2Hosts: {
		organizationId: "v2_hosts.organization_id",
		machineId: "v2_hosts.machine_id",
		name: "v2_hosts.name",
		kind: "v2_hosts.kind",
		provider: "v2_hosts.provider",
		port: "v2_hosts.port",
		protocol: "v2_hosts.protocol",
		expiresAt: "v2_hosts.expires_at",
		createdByUserId: "v2_hosts.created_by_user_id",
	},
	v2UsersHosts: {
		organizationId: "v2_users_hosts.organization_id",
		userId: "v2_users_hosts.user_id",
		hostId: "v2_users_hosts.host_id",
		role: "v2_users_hosts.role",
	},
}));

mock.module("@rox/db/utils", () => ({
	getCurrentTxid: getCurrentTxidMock,
}));

mock.module("../integration/utils", () => ({
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: mock(async () => ({
		membership: { role: "owner" },
		subscription: null,
	})),
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { v2HostRouter } = await import("./v2-host");

const createCaller = createCallerFactory(
	createTRPCRouter({
		v2Host: v2HostRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function authedContext() {
	return {
		session: {
			user: { id: USER_ID, email: "u@example.com" },
			session: { activeOrganizationId: ORG_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

beforeEach(() => {
	txInsertReturningResults = [];
	txInsert.mockClear();
	txInsertValues.mockClear();
	txInsertOnConflictDoNothing.mockClear();
	txInsertReturning.mockClear();
	transactionMock.mockClear();
	getCurrentTxidMock.mockClear();
	verifyOrgMembershipMock.mockClear();
});

describe("v2Host.addServer", () => {
	it("registers a self-managed remote host and owner membership", async () => {
		const hostRow = {
			organizationId: ORG_ID,
			machineId: "remote.example.com",
			name: "Build box",
			kind: "remote",
			provider: "self",
			port: 9443,
			protocol: "https",
			expiresAt: null,
			createdByUserId: USER_ID,
		};
		txInsertReturningResults.push([hostRow], [{ userId: USER_ID }]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Host.addServer({
			name: " Build box ",
			host: "https://remote.example.com:8443",
			port: 9443,
			protocol: "https",
			kind: "remote",
		});

		expect(result).toEqual({ ...hostRow, txid: 456 });
		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(USER_ID, ORG_ID);
		expect(txInsertValues).toHaveBeenNthCalledWith(1, {
			organizationId: ORG_ID,
			machineId: "remote.example.com",
			name: "Build box",
			kind: "remote",
			provider: "self",
			port: 9443,
			protocol: "https",
			expiresAt: null,
			createdByUserId: USER_ID,
		});
		expect(txInsertValues).toHaveBeenNthCalledWith(2, {
			organizationId: ORG_ID,
			userId: USER_ID,
			hostId: "remote.example.com",
			role: "owner",
		});
	});
});
