import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));

// Connection lookups (db.query.integrationConnections.findFirst) are queued per
// test so each procedure call gets a deterministic row without leaking secrets.
let connectionFindFirstResults: unknown[] = [];
const connectionFindFirst = mock(
	async () => connectionFindFirstResults.shift() ?? null,
);

// `db.update(...).set(...).where(...)` chain used by updateConfig.
const updateWhere = mock(async () => undefined);
const updateSet = mock(() => ({ where: updateWhere }));
const dbUpdate = mock(() => ({ set: updateSet }));

// `dbWs.transaction` chain used by disconnect. The transaction body issues
// delete/update/findMany calls against the provided `tx`; results are queued.
let txDeleteReturningResults: unknown[][] = [];
let txStatusesFindManyResults: unknown[][] = [];

const txDeleteReturning = mock(
	async () => txDeleteReturningResults.shift() ?? [],
);
const txDeleteWhere = mock(() => ({ returning: txDeleteReturning }));
const txDelete = mock(() => ({ where: txDeleteWhere }));

const txUpdateWhere = mock(async () => undefined);
const txUpdateSet = mock(() => ({ where: txUpdateWhere }));
const txUpdate = mock(() => ({ set: txUpdateSet }));

const txStatusesFindMany = mock(
	async () => txStatusesFindManyResults.shift() ?? [],
);

const tx = {
	delete: txDelete,
	update: txUpdate,
	query: { taskStatuses: { findMany: txStatusesFindMany } },
};
const transactionMock = mock(async (cb: (tx: unknown) => unknown) => cb(tx));

const seedDefaultStatusesMock = mock(async () => "backlog-status-id");

// callLinear is the only seam that talks to Linear's API; mocking it keeps the
// test hermetic (no network, no @linear/sdk client, no tokens touched).
const linearClientStub = {
	teams: mock(async () => linearTeamsResult),
	logout: mock(async () => undefined),
};
let linearTeamsResult: unknown = {
	nodes: [{ id: "team-1", name: "Engineering", key: "ENG" }],
};
const callLinearMock = mock(
	async (
		_organizationId: string,
		fn: (client: unknown) => unknown,
	): Promise<unknown> => fn(linearClientStub),
);

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: { findFirst: connectionFindFirst },
		},
		update: dbUpdate,
	},
	dbWs: {
		transaction: transactionMock,
	},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	integrationConnections: {
		id: "integration_connections.id",
		organizationId: "integration_connections.organization_id",
		provider: "integration_connections.provider",
		config: "integration_connections.config",
	},
	tasks: {
		organizationId: "tasks.organization_id",
		externalProvider: "tasks.external_provider",
		statusId: "tasks.status_id",
	},
	taskStatuses: {
		id: "task_statuses.id",
		organizationId: "task_statuses.organization_id",
		externalProvider: "task_statuses.external_provider",
	},
}));

mock.module("@rox/db/seed-default-statuses", () => ({
	seedDefaultStatuses: seedDefaultStatusesMock,
}));

mock.module("../utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgOwner: mock(async () => ({ membership: { role: "owner" } })),
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: mock(async () => ({
		membership: { role: "owner" },
		subscription: null,
	})),
}));

mock.module("./refresh", () => ({
	callLinear: callLinearMock,
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../../trpc");
const { linearRouter } = await import("./linear");

const createCaller = createCallerFactory(
	createTRPCRouter({
		linear: linearRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";

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
	connectionFindFirstResults = [];
	txDeleteReturningResults = [];
	txStatusesFindManyResults = [];
	linearTeamsResult = {
		nodes: [{ id: "team-1", name: "Engineering", key: "ENG" }],
	};

	connectionFindFirst.mockClear();
	dbUpdate.mockClear();
	updateSet.mockClear();
	updateWhere.mockClear();
	txDelete.mockClear();
	txDeleteWhere.mockClear();
	txDeleteReturning.mockClear();
	txUpdate.mockClear();
	txUpdateSet.mockClear();
	txUpdateWhere.mockClear();
	txStatusesFindMany.mockClear();
	transactionMock.mockClear();
	seedDefaultStatusesMock.mockClear();
	callLinearMock.mockClear();
	linearClientStub.teams.mockClear();
	linearClientStub.logout.mockClear();

	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
	verifyOrgAdminMock.mockReset();
	verifyOrgAdminMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
});

describe("linear.getConnection", () => {
	it("returns null when no connection exists", async () => {
		connectionFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		const result = await caller.linear.getConnection({
			organizationId: ORG_ID,
		});

		expect(result).toBeNull();
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
	});

	it("maps the stored config and reconnect state", async () => {
		connectionFindFirstResults.push({
			id: CONNECTION_ID,
			config: { provider: "linear", newTasksTeamId: "team-1" },
			disconnectedAt: new Date("2026-01-01T00:00:00.000Z"),
			disconnectReason: "invalid_grant",
		});
		const caller = createCaller(authedContext());

		const result = await caller.linear.getConnection({
			organizationId: ORG_ID,
		});

		expect(result).toEqual({
			config: { provider: "linear", newTasksTeamId: "team-1" },
			needsReconnect: true,
			disconnectReason: "invalid_grant",
		});
	});

	it("rejects non-members", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "nope" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.linear.getConnection({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("linear.disconnect", () => {
	it("tears down linear data and returns success", async () => {
		// statuses queried inside the tx: one default backlog + one linear status
		txStatusesFindManyResults.push([
			{ id: "default-backlog", externalProvider: null, type: "backlog" },
			{ id: "linear-status", externalProvider: "linear", type: "backlog" },
		]);
		// Only the final connection delete reads `.returning()`; the tasks and
		// statuses deletes don't, so they never consume from this queue.
		txDeleteReturningResults.push([{ id: CONNECTION_ID }]); // connection delete
		const caller = createCaller(authedContext());

		const result = await caller.linear.disconnect({ organizationId: ORG_ID });

		expect(result).toEqual({ success: true });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(seedDefaultStatusesMock).toHaveBeenCalledTimes(1);
		expect(callLinearMock).toHaveBeenCalledTimes(1);
	});

	it("returns failure when no connection was deleted", async () => {
		txStatusesFindManyResults.push([]);
		txDeleteReturningResults.push([]); // connection delete -> nothing
		const caller = createCaller(authedContext());

		const result = await caller.linear.disconnect({ organizationId: ORG_ID });

		expect(result).toEqual({ success: false, error: "No connection found" });
	});

	it("requires admin access", async () => {
		verifyOrgAdminMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.linear.disconnect({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(transactionMock).not.toHaveBeenCalled();
	});
});

describe("linear.getTeams", () => {
	it("maps Linear teams to id/name/key", async () => {
		const caller = createCaller(authedContext());

		const result = await caller.linear.getTeams({ organizationId: ORG_ID });

		expect(result).toEqual([{ id: "team-1", name: "Engineering", key: "ENG" }]);
		expect(callLinearMock).toHaveBeenCalledTimes(1);
	});

	it("returns an empty list when not connected", async () => {
		callLinearMock.mockImplementationOnce(async () => null);
		const caller = createCaller(authedContext());

		const result = await caller.linear.getTeams({ organizationId: ORG_ID });

		expect(result).toEqual([]);
	});
});

describe("linear.updateConfig", () => {
	it("persists the selected team and returns success", async () => {
		const caller = createCaller(authedContext());

		const result = await caller.linear.updateConfig({
			organizationId: ORG_ID,
			newTasksTeamId: "team-9",
		});

		expect(result).toEqual({ success: true });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
		expect(dbUpdate).toHaveBeenCalledTimes(1);
		expect(updateSet).toHaveBeenCalledWith({
			config: { provider: "linear", newTasksTeamId: "team-9" },
		});
	});

	it("requires admin access", async () => {
		verifyOrgAdminMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.linear.updateConfig({
				organizationId: ORG_ID,
				newTasksTeamId: "team-9",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(dbUpdate).not.toHaveBeenCalled();
	});
});
