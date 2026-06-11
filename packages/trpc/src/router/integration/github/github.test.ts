import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));

// Queued results for db.query.githubInstallations.findFirst — consumed one per call.
let installationFindFirstResults: unknown[] = [];
const installationFindFirst = mock(
	async () => installationFindFirstResults.shift() ?? null,
);

// Queued results for db.query.githubRepositories.findMany — consumed one per call.
let repositoriesFindManyResults: unknown[][] = [];
const repositoriesFindMany = mock(
	async () => repositoriesFindManyResults.shift() ?? [],
);

// Queued results for db.query.githubPullRequests.findMany — consumed one per call.
let pullRequestsFindManyResults: unknown[][] = [];
const pullRequestsFindMany = mock(
	async () => pullRequestsFindManyResults.shift() ?? [],
);

// db.delete(...).where(...).returning(...) chain used by disconnect.
let deleteReturningResult: unknown[] = [];
const deleteReturning = mock(async () => deleteReturningResult);
const deleteWhere = mock(() => ({ returning: deleteReturning }));
const dbDelete = mock(() => ({ where: deleteWhere }));

// QStash client — mocked so no network or token is required.
const publishJSONMock = mock(async () => undefined);
mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSONMock;
	},
}));

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			githubInstallations: { findFirst: installationFindFirst },
			githubRepositories: { findMany: repositoriesFindMany },
			githubPullRequests: { findMany: pullRequestsFindMany },
		},
		delete: dbDelete,
	},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	githubInstallations: {
		id: "github_installations.id",
		organizationId: "github_installations.organization_id",
		accountLogin: "github_installations.account_login",
		accountType: "github_installations.account_type",
		suspended: "github_installations.suspended",
		lastSyncedAt: "github_installations.last_synced_at",
		createdAt: "github_installations.created_at",
	},
	githubRepositories: {
		id: "github_repositories.id",
		installationId: "github_repositories.installation_id",
		updatedAt: "github_repositories.updated_at",
	},
	githubPullRequests: {
		id: "github_pull_requests.id",
		repositoryId: "github_pull_requests.repository_id",
		state: "github_pull_requests.state",
		checksStatus: "github_pull_requests.checks_status",
		updatedAt: "github_pull_requests.updated_at",
	},
}));

mock.module("../utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgOwner: mock(async () => ({ membership: { role: "owner" } })),
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: mock(async () => ({
		membership: { role: "member" },
		subscription: null,
	})),
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	desc: (col: unknown) => ({ type: "desc", col }),
	inArray: (col: unknown, values: unknown) => ({
		type: "inArray",
		col,
		values,
	}),
}));

mock.module("../../../env", () => ({
	env: {
		QSTASH_TOKEN: "test-qstash-token",
		NEXT_PUBLIC_API_URL: "https://api.example.com",
		NODE_ENV: "test",
	},
}));

const { createCallerFactory, createTRPCRouter } = await import("../../../trpc");
const { githubRouter } = await import("./github");

const createCaller = createCallerFactory(
	createTRPCRouter({
		github: githubRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const INSTALLATION_ID = "33333333-3333-4333-8333-333333333333";
const REPO_ID = "44444444-4444-4444-8444-444444444444";
const PR_ID = "55555555-5555-4555-8555-555555555555";

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

const sampleInstallation = {
	id: INSTALLATION_ID,
	accountLogin: "my-org",
	accountType: "Organization",
	suspended: false,
	lastSyncedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
	installationFindFirstResults = [];
	repositoriesFindManyResults = [];
	pullRequestsFindManyResults = [];
	deleteReturningResult = [];

	installationFindFirst.mockClear();
	repositoriesFindMany.mockClear();
	pullRequestsFindMany.mockClear();
	dbDelete.mockClear();
	deleteWhere.mockClear();
	deleteReturning.mockClear();
	publishJSONMock.mockClear();

	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "member" },
	}));
	verifyOrgAdminMock.mockReset();
	verifyOrgAdminMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
});

describe("github.getInstallation", () => {
	it("returns null when no installation exists", async () => {
		installationFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		const result = await caller.github.getInstallation({
			organizationId: ORG_ID,
		});

		expect(result).toBeNull();
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
	});

	it("returns installation metadata when connected", async () => {
		installationFindFirstResults.push(sampleInstallation);
		const caller = createCaller(authedContext());

		const result = await caller.github.getInstallation({
			organizationId: ORG_ID,
		});

		expect(result).toEqual(sampleInstallation);
	});

	it("rejects non-members", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "nope" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.github.getInstallation({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("github.disconnect", () => {
	it("deletes the installation and returns success", async () => {
		deleteReturningResult = [{ id: INSTALLATION_ID }];
		const caller = createCaller(authedContext());

		const result = await caller.github.disconnect({ organizationId: ORG_ID });

		expect(result).toEqual({ success: true });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
		expect(dbDelete).toHaveBeenCalledTimes(1);
	});

	it("returns failure when no installation was found", async () => {
		deleteReturningResult = [];
		const caller = createCaller(authedContext());

		const result = await caller.github.disconnect({ organizationId: ORG_ID });

		expect(result).toEqual({ success: false, error: "No installation found" });
	});

	it("requires admin access", async () => {
		verifyOrgAdminMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.github.disconnect({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(dbDelete).not.toHaveBeenCalled();
	});
});

describe("github.triggerSync", () => {
	it("throws NOT_FOUND when no installation exists", async () => {
		installationFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		await expect(
			caller.github.triggerSync({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("publishes a QStash sync job when installation exists (non-dev)", async () => {
		installationFindFirstResults.push({ id: INSTALLATION_ID });
		const caller = createCaller(authedContext());

		const result = await caller.github.triggerSync({
			organizationId: ORG_ID,
		});

		expect(result).toEqual({ success: true });
		expect(publishJSONMock).toHaveBeenCalledTimes(1);
		const [call] = publishJSONMock.mock.calls;
		expect(call[0]).toMatchObject({
			body: {
				installationDbId: INSTALLATION_ID,
				organizationId: ORG_ID,
			},
		});
	});

	it("requires membership", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "member only" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.github.triggerSync({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("github.listRepositories", () => {
	it("returns empty array when no installation exists", async () => {
		installationFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		const result = await caller.github.listRepositories({
			organizationId: ORG_ID,
		});

		expect(result).toEqual([]);
	});

	it("returns repositories for the installation", async () => {
		installationFindFirstResults.push({ id: INSTALLATION_ID });
		const repos = [
			{
				id: REPO_ID,
				installationId: INSTALLATION_ID,
				fullName: "my-org/my-repo",
				owner: "my-org",
				name: "my-repo",
			},
		];
		repositoriesFindManyResults.push(repos);
		const caller = createCaller(authedContext());

		const result = await caller.github.listRepositories({
			organizationId: ORG_ID,
		});

		expect(result).toEqual(repos);
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
	});
});

describe("github.listPullRequests", () => {
	it("returns empty array when no installation exists", async () => {
		installationFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		const result = await caller.github.listPullRequests({
			organizationId: ORG_ID,
		});

		expect(result).toEqual([]);
	});

	it("returns empty array when no repos exist for the installation", async () => {
		installationFindFirstResults.push({ id: INSTALLATION_ID });
		repositoriesFindManyResults.push([]);
		const caller = createCaller(authedContext());

		const result = await caller.github.listPullRequests({
			organizationId: ORG_ID,
		});

		expect(result).toEqual([]);
	});

	it("returns pull requests with repository info", async () => {
		installationFindFirstResults.push({ id: INSTALLATION_ID });
		repositoriesFindManyResults.push([{ id: REPO_ID }]);
		const prs = [
			{
				id: PR_ID,
				prNumber: 42,
				title: "Fix the bug",
				state: "open",
				checksStatus: "success",
				repository: {
					id: REPO_ID,
					fullName: "my-org/my-repo",
					owner: "my-org",
					name: "my-repo",
				},
			},
		];
		pullRequestsFindManyResults.push(prs);
		const caller = createCaller(authedContext());

		const result = await caller.github.listPullRequests({
			organizationId: ORG_ID,
			state: "open",
		});

		expect(result).toEqual(prs);
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
	});
});

describe("github.getStats", () => {
	it("returns zeroed stats when no installation exists", async () => {
		installationFindFirstResults.push(null);
		const caller = createCaller(authedContext());

		const result = await caller.github.getStats({ organizationId: ORG_ID });

		expect(result).toEqual({
			repositoryCount: 0,
			openPullRequestCount: 0,
			pendingChecksCount: 0,
			failedChecksCount: 0,
		});
	});

	it("returns zeroed stats when no repositories exist", async () => {
		installationFindFirstResults.push({ id: INSTALLATION_ID });
		repositoriesFindManyResults.push([]);
		const caller = createCaller(authedContext());

		const result = await caller.github.getStats({ organizationId: ORG_ID });

		expect(result).toEqual({
			repositoryCount: 0,
			openPullRequestCount: 0,
			pendingChecksCount: 0,
			failedChecksCount: 0,
		});
	});

	it("counts repos, open PRs, and checks status correctly", async () => {
		installationFindFirstResults.push({ id: INSTALLATION_ID });
		repositoriesFindManyResults.push([{ id: REPO_ID }, { id: "repo-2" }]);
		pullRequestsFindManyResults.push([
			{ id: "pr-1", checksStatus: "success" },
			{ id: "pr-2", checksStatus: "pending" },
			{ id: "pr-3", checksStatus: "failure" },
			{ id: "pr-4", checksStatus: "failure" },
		]);
		const caller = createCaller(authedContext());

		const result = await caller.github.getStats({ organizationId: ORG_ID });

		expect(result).toEqual({
			repositoryCount: 2,
			openPullRequestCount: 4,
			pendingChecksCount: 1,
			failedChecksCount: 2,
		});
	});
});
