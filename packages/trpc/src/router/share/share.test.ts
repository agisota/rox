import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";
import { z } from "zod";

const getCurrentTxidMock = mock(async () => 123);

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));

let accessGrantsFindManyResults: unknown[][] = [];
let artifactsFindFirstResults: unknown[] = [];
let chatSessionsFindFirstResults: unknown[] = [];
let publicSharesFindFirstResults: unknown[] = [];
let txInsertReturningResults: unknown[][] = [];
let txDeleteReturningResults: unknown[][] = [];
let txUpdateReturningResults: unknown[][] = [];

const accessGrantsFindMany = mock(
	async () => accessGrantsFindManyResults.shift() ?? [],
);
const artifactsFindFirst = mock(
	async () => artifactsFindFirstResults.shift() ?? null,
);
const chatSessionsFindFirst = mock(
	async () => chatSessionsFindFirstResults.shift() ?? null,
);
const publicSharesFindFirst = mock(
	async () => publicSharesFindFirstResults.shift() ?? null,
);

const txInsertReturning = mock(
	async () => txInsertReturningResults.shift() ?? [],
);
const txInsertOnConflict = mock(() => ({ returning: txInsertReturning }));
const txInsertValues = mock(() => ({
	onConflictDoUpdate: txInsertOnConflict,
	returning: txInsertReturning,
}));
const txInsert = mock(() => ({ values: txInsertValues }));

const txDeleteReturning = mock(
	async () => txDeleteReturningResults.shift() ?? [],
);
const txDeleteWhere = mock(() => ({ returning: txDeleteReturning }));
const txDelete = mock(() => ({ where: txDeleteWhere }));

const txUpdateReturning = mock(
	async () => txUpdateReturningResults.shift() ?? [],
);
const txUpdateWhere = mock(() => ({ returning: txUpdateReturning }));
const txUpdateSet = mock(() => ({ where: txUpdateWhere }));
const txUpdate = mock(() => ({ set: txUpdateSet }));

const tx = { insert: txInsert, delete: txDelete, update: txUpdate };
const transactionMock = mock(async (cb: (tx: unknown) => unknown) => cb(tx));

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			accessGrants: { findMany: accessGrantsFindMany },
			artifacts: { findFirst: artifactsFindFirst },
			chatSessions: { findFirst: chatSessionsFindFirst },
			members: { findFirst: mock(async () => null) },
			publicShares: { findFirst: publicSharesFindFirst },
		},
	},
	dbWs: {
		transaction: transactionMock,
	},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
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
	artifacts: {
		id: "artifacts.id",
		organizationId: "artifacts.organization_id",
		kind: "artifacts.kind",
		title: "artifacts.title",
		body: "artifacts.body",
		markdown: "artifacts.markdown",
		blobPathname: "artifacts.blob_pathname",
		mediaType: "artifacts.media_type",
		createdByUserId: "artifacts.created_by_user_id",
		createdAt: "artifacts.created_at",
	},
	chatSessions: {
		id: "chat_sessions.id",
		organizationId: "chat_sessions.organization_id",
		createdBy: "chat_sessions.created_by",
		title: "chat_sessions.title",
		createdAt: "chat_sessions.created_at",
		updatedAt: "chat_sessions.updated_at",
		lastActiveAt: "chat_sessions.last_active_at",
	},
	publicShares: {
		id: "public_shares.id",
		organizationId: "public_shares.organization_id",
		resourceType: "public_shares.resource_type",
		resourceId: "public_shares.resource_id",
		slug: "public_shares.slug",
		title: "public_shares.title",
		payload: "public_shares.payload",
		createdByUserId: "public_shares.created_by_user_id",
		createdAt: "public_shares.created_at",
		revokedAt: "public_shares.revoked_at",
	},
	accessResourceTypeEnum: z.enum(["project", "workspace", "host"]),
	accessGranteeTypeEnum: z.enum(["user", "team", "organization"]),
	accessRoleEnum: z.enum(["viewer", "editor", "admin"]),
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
	verifyOrgOwner: mock(async () => ({ membership: { role: "owner" } })),
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: verifyOrgMembershipWithSubscriptionMock,
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	isNull: (value: unknown) => ({ type: "isNull", value }),
}));

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
const SHARE_ID = "77777777-7777-4777-8777-777777777777";
const SHARE_SLUG = "abc123xyz";

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
	artifactsFindFirstResults = [];
	chatSessionsFindFirstResults = [];
	publicSharesFindFirstResults = [];
	txInsertReturningResults = [];
	txDeleteReturningResults = [];
	txUpdateReturningResults = [];

	accessGrantsFindMany.mockClear();
	artifactsFindFirst.mockClear();
	chatSessionsFindFirst.mockClear();
	publicSharesFindFirst.mockClear();
	txInsert.mockClear();
	txInsertValues.mockClear();
	txInsertOnConflict.mockClear();
	txInsertReturning.mockClear();
	txDelete.mockClear();
	txDeleteWhere.mockClear();
	txDeleteReturning.mockClear();
	txUpdate.mockClear();
	txUpdateSet.mockClear();
	txUpdateWhere.mockClear();
	txUpdateReturning.mockClear();
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

describe("share.publishChatSession", () => {
	it("publishes a chat snapshot and returns a public URL", async () => {
		chatSessionsFindFirstResults.push({
			id: RESOURCE_ID,
			title: "Build log",
			createdAt: new Date("2026-06-15T10:00:00.000Z"),
			updatedAt: new Date("2026-06-15T10:05:00.000Z"),
			lastActiveAt: new Date("2026-06-15T10:05:00.000Z"),
		});
		publicSharesFindFirstResults.push(null);
		txInsertReturningResults.push([{ id: SHARE_ID, slug: SHARE_SLUG }]);
		const caller = createCaller(authedContext());

		const result = await caller.share.publishChatSession({
			sessionId: RESOURCE_ID,
			messages: [
				{
					id: "message-1",
					role: "user",
					content: [{ type: "text", text: "Ship it" }],
				},
			],
		});

		expect(result).toEqual({
			id: SHARE_ID,
			slug: SHARE_SLUG,
			url: `https://app.rox.one/s/${SHARE_SLUG}`,
		});
		expect(chatSessionsFindFirst).toHaveBeenCalledTimes(1);
		expect(txInsert).toHaveBeenCalledTimes(1);
	});

	it("rejects missing chat sessions", async () => {
		chatSessionsFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		await expect(
			caller.share.publishChatSession({
				sessionId: RESOURCE_ID,
				messages: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("share.publishArtifact", () => {
	it("publishes an owned artifact snapshot and returns a public URL", async () => {
		artifactsFindFirstResults.push({
			id: RESOURCE_ID,
			kind: "report",
			title: "Release report",
			body: { status: "ready" },
			markdown: "# Release report",
			blobPathname: null,
			mediaType: "text/markdown",
			createdByUserId: USER_ID,
			createdAt: new Date("2026-06-15T10:00:00.000Z"),
		});
		publicSharesFindFirstResults.push(null);
		txInsertReturningResults.push([{ id: SHARE_ID, slug: SHARE_SLUG }]);
		const caller = createCaller(authedContext());

		const result = await caller.share.publishArtifact({
			artifactId: RESOURCE_ID,
		});

		expect(result).toEqual({
			id: SHARE_ID,
			slug: SHARE_SLUG,
			url: `https://app.rox.one/s/${SHARE_SLUG}`,
		});
		expect(artifactsFindFirst).toHaveBeenCalledTimes(1);
		expect(txInsert).toHaveBeenCalledTimes(1);
	});

	it("rejects artifacts owned by another user", async () => {
		artifactsFindFirstResults.push({
			id: RESOURCE_ID,
			kind: "report",
			title: "Other report",
			body: null,
			markdown: null,
			blobPathname: null,
			mediaType: null,
			createdByUserId: GRANTEE_ID,
			createdAt: new Date("2026-06-15T10:00:00.000Z"),
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.share.publishArtifact({
				artifactId: RESOURCE_ID,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
