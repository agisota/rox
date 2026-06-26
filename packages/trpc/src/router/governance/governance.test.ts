import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";
import {
	createGovernanceItemSchema,
	deleteGovernanceItemSchema,
	updateGovernanceItemSchema,
} from "./schema";

// ---------------------------------------------------------------------------
// Mocks (bun:test `mock.module`, declared before the dynamic router import).
// Mirrors v2-host.test.ts: stub @rox/db/client (db + dbWs.transaction),
// @rox/db/utils.getCurrentTxid, ../integration/utils.verifyOrgMembership, and
// drizzle's and/eq so where-clause args stay inspectable.
// ---------------------------------------------------------------------------

const getCurrentTxidMock = mock(async () => 789);
const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "owner" },
}));

// db.select(...).from(...).where(...).limit(...) returns the next queued result.
let selectResults: unknown[][] = [];
const selectLimit = mock(async () => selectResults.shift() ?? []);
const selectWhere = mock(() => ({ limit: selectLimit }));
const selectFrom = mock(() => ({ where: selectWhere }));
const dbSelect = mock(() => ({ from: selectFrom }));

// tx.insert(...).values(...) / tx.update(...).set(...).where(...) /
// tx.delete(...).where(...) — each records its arg for assertions.
const txInsertValues = mock(async () => undefined);
const txInsert = mock(() => ({ values: txInsertValues }));
const txUpdateWhere = mock(async () => undefined);
const txUpdateSet = mock(() => ({ where: txUpdateWhere }));
const txUpdate = mock(() => ({ set: txUpdateSet }));
const txDeleteWhere = mock(async () => undefined);
const txDelete = mock(() => ({ where: txDeleteWhere }));
const tx = { insert: txInsert, update: txUpdate, delete: txDelete };
const transactionMock = mock(async (cb: (tx: unknown) => unknown) => cb(tx));

mock.module("@rox/db/client", () => ({
	db: { select: dbSelect },
	dbWs: { transaction: transactionMock },
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
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { governanceRouter } = await import("./governance");

const createCaller = createCallerFactory(
	createTRPCRouter({
		governance: governanceRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";

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
	selectResults = [];
	selectLimit.mockClear();
	selectWhere.mockClear();
	selectFrom.mockClear();
	dbSelect.mockClear();
	txInsert.mockClear();
	txInsertValues.mockClear();
	txUpdate.mockClear();
	txUpdateSet.mockClear();
	txUpdateWhere.mockClear();
	txDelete.mockClear();
	txDeleteWhere.mockClear();
	transactionMock.mockClear();
	getCurrentTxidMock.mockClear();
	verifyOrgMembershipMock.mockClear();
});

describe("governance.create", () => {
	it("verifies the workspace, inserts with org + createdBy, returns txid", async () => {
		// 1st select = verifyWorkspaceInOrg → workspace belongs to org.
		selectResults.push([{ organizationId: ORG_ID }]);

		const caller = createCaller(authedContext());
		const result = await caller.governance.create({
			id: ITEM_ID,
			workspaceId: WORKSPACE_ID,
			kind: "goal",
			text: "Ship #517",
			order: 0,
		});

		expect(result).toEqual({ txid: 789 });
		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(USER_ID, ORG_ID);
		expect(txInsertValues).toHaveBeenCalledWith({
			id: ITEM_ID,
			organizationId: ORG_ID,
			v2WorkspaceId: WORKSPACE_ID,
			createdBy: USER_ID,
			kind: "goal",
			text: "Ship #517",
			order: 0,
		});
		expect(getCurrentTxidMock).toHaveBeenCalledTimes(1);
	});

	it("rejects a workspace that is not in the active org", async () => {
		// verifyWorkspaceInOrg → no matching workspace row.
		selectResults.push([]);

		const caller = createCaller(authedContext());
		await expect(
			caller.governance.create({
				id: ITEM_ID,
				workspaceId: WORKSPACE_ID,
				kind: "task",
				text: "nope",
				order: 0,
			}),
		).rejects.toThrow(/Workspace not found/);
		expect(txInsertValues).not.toHaveBeenCalled();
	});
});

describe("governance.update", () => {
	it("updates text org-scoped and returns txid", async () => {
		// getGovernanceItemForOrg → row exists in org.
		selectResults.push([{ id: ITEM_ID }]);

		const caller = createCaller(authedContext());
		const result = await caller.governance.update({
			id: ITEM_ID,
			text: "Edited",
		});

		expect(result).toEqual({ txid: 789 });
		expect(txUpdateSet).toHaveBeenCalledWith({ text: "Edited" });
		expect(getCurrentTxidMock).toHaveBeenCalledTimes(1);
	});

	it("rejects when neither text nor order is provided", async () => {
		selectResults.push([{ id: ITEM_ID }]);

		const caller = createCaller(authedContext());
		await expect(caller.governance.update({ id: ITEM_ID })).rejects.toThrow(
			/Nothing to update/,
		);
		expect(txUpdateSet).not.toHaveBeenCalled();
	});

	it("rejects an item that is not in the active org", async () => {
		selectResults.push([]);

		const caller = createCaller(authedContext());
		await expect(
			caller.governance.update({ id: ITEM_ID, text: "x" }),
		).rejects.toThrow(/Governance item not found/);
	});
});

describe("governance.delete", () => {
	it("deletes org-scoped and returns txid", async () => {
		selectResults.push([{ id: ITEM_ID }]);

		const caller = createCaller(authedContext());
		const result = await caller.governance.delete({ id: ITEM_ID });

		expect(result).toEqual({ txid: 789 });
		expect(txDeleteWhere).toHaveBeenCalledTimes(1);
		expect(getCurrentTxidMock).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// Pure input-schema validation (no DB).
// ---------------------------------------------------------------------------

describe("governance input schemas", () => {
	it("create: accepts a valid goal/task/mission payload", () => {
		const parsed = createGovernanceItemSchema.safeParse({
			id: ITEM_ID,
			workspaceId: WORKSPACE_ID,
			kind: "mission",
			text: "Reach G5",
			order: 3,
		});
		expect(parsed.success).toBe(true);
	});

	it("create: rejects an unknown kind", () => {
		const parsed = createGovernanceItemSchema.safeParse({
			id: ITEM_ID,
			workspaceId: WORKSPACE_ID,
			kind: "epic",
			text: "x",
			order: 0,
		});
		expect(parsed.success).toBe(false);
	});

	it("create: rejects empty text", () => {
		const parsed = createGovernanceItemSchema.safeParse({
			id: ITEM_ID,
			workspaceId: WORKSPACE_ID,
			kind: "goal",
			text: "   ",
			order: 0,
		});
		expect(parsed.success).toBe(false);
	});

	it("create: rejects a non-uuid id", () => {
		const parsed = createGovernanceItemSchema.safeParse({
			id: "not-a-uuid",
			workspaceId: WORKSPACE_ID,
			kind: "goal",
			text: "x",
			order: 0,
		});
		expect(parsed.success).toBe(false);
	});

	it("create: rejects a negative order", () => {
		const parsed = createGovernanceItemSchema.safeParse({
			id: ITEM_ID,
			workspaceId: WORKSPACE_ID,
			kind: "goal",
			text: "x",
			order: -1,
		});
		expect(parsed.success).toBe(false);
	});

	it("update: allows a partial (text only) patch", () => {
		const parsed = updateGovernanceItemSchema.safeParse({
			id: ITEM_ID,
			text: "edited",
		});
		expect(parsed.success).toBe(true);
	});

	it("delete: requires a uuid id", () => {
		expect(deleteGovernanceItemSchema.safeParse({ id: ITEM_ID }).success).toBe(
			true,
		);
		expect(deleteGovernanceItemSchema.safeParse({ id: "nope" }).success).toBe(
			false,
		);
	});
});
