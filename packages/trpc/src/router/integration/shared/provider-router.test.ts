import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));

let connectionFindFirstResults: unknown[] = [];
const connectionFindFirst = mock(
	async () => connectionFindFirstResults.shift() ?? null,
);

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: { findFirst: connectionFindFirst },
		},
	},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	integrationConnections: {
		id: "integration_connections.id",
		organizationId: "integration_connections.organization_id",
		workspaceId: "integration_connections.workspace_id",
		provider: "integration_connections.provider",
		externalOrgName: "integration_connections.external_org_name",
		config: "integration_connections.config",
		createdAt: "integration_connections.created_at",
	},
}));

mock.module("../utils", () => ({
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgAdmin: mock(async () => ({
		membership: { role: "owner" },
	})),
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	isNull: (col: unknown) => ({ type: "isNull", col }),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../../trpc");
const { telegramRouter } = await import("../telegram");

const createCaller = createCallerFactory(
	createTRPCRouter({
		telegram: telegramRouter,
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
	connectionFindFirst.mockClear();
	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "member" },
	}));
});

describe("provider testConnection", () => {
	it("validates an existing manual connection without exposing stored tokens", async () => {
		connectionFindFirstResults.push({
			id: CONNECTION_ID,
			externalOrgName: "@rox_agent_bot",
			config: {
				provider: "telegram",
				botUsername: "@rox_agent_bot",
			},
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		const caller = createCaller(authedContext());

		const result = await caller.telegram.testConnection({
			organizationId: ORG_ID,
		});

		expect(result).toEqual({
			success: true,
			provider: "telegram",
			externalOrgName: "@rox_agent_bot",
			checkedAt: expect.any(Date),
		});
		expect(JSON.stringify(result)).not.toContain("token");
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
	});

	it("returns a validation failure when no connection exists", async () => {
		connectionFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		const result = await caller.telegram.testConnection({
			organizationId: ORG_ID,
		});

		expect(result).toEqual({
			success: false,
			provider: "telegram",
			error: "No connection found",
			checkedAt: expect.any(Date),
		});
	});

	it("rejects non-members", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "nope" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.telegram.testConnection({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
