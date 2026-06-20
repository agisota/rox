import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";

// C4: sandbox_images threading. project.create must accept optional sandbox
// image config (setupCommands / baseImage / systemPackages) and persist it on
// the auto-created sandbox_images row, and a getSandboxImage query must read it
// back, scoped to the caller's org.

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));
const verifyOrgOwnerMock = mock(async () => ({
	membership: { role: "owner" },
}));

let projectsFindResults: unknown[] = [];
let githubReposFindResults: unknown[] = [];
let sandboxImagesFindResults: unknown[] = [];
let projectInsertReturningResults: unknown[][] = [];
const sandboxInsertValuesCalls: unknown[] = [];

const projectsFindFirst = mock(async () => projectsFindResults.shift() ?? null);
const githubReposFindFirst = mock(
	async () => githubReposFindResults.shift() ?? null,
);
const sandboxImagesFindFirst = mock(
	async () => sandboxImagesFindResults.shift() ?? null,
);

const projectInsertReturning = mock(
	async () => projectInsertReturningResults.shift() ?? [],
);
const projectInsertValues = mock(() => ({ returning: projectInsertReturning }));

const sandboxInsertValues = mock((values: unknown) => {
	sandboxInsertValuesCalls.push(values);
	return undefined;
});

// dbWs.insert is dispatched by which table is passed. The project router calls
// insert(projects).values().returning() then insert(sandboxImages).values().
const dbInsert = mock((table: unknown) => {
	if (table === realDbSchema.sandboxImages) {
		return { values: sandboxInsertValues };
	}
	return { values: projectInsertValues };
});

mock.module("@rox/db/client", () => ({
	db: {},
	dbWs: {
		query: {
			projects: { findFirst: projectsFindFirst },
			githubRepositories: { findFirst: githubReposFindFirst },
			sandboxImages: { findFirst: sandboxImagesFindFirst },
		},
		insert: dbInsert,
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: mock(async () => []) })),
			})),
		})),
		delete: mock(() => ({ where: mock(async () => undefined) })),
	},
}));

mock.module("../integration/utils", () => ({
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgOwner: verifyOrgOwnerMock,
}));

mock.module("../utils/org-resource-access", () => ({
	requireOrgResourceAccess: mock(
		async (_userId: string, finder: () => unknown) => {
			const row = await finder();
			if (!row) throw new Error("not found");
			return row;
		},
	),
	requireOrgScopedResource: mock(async (finder: () => unknown) => {
		const row = await finder();
		if (!row) throw new Error("not found");
		return row;
	}),
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { projectRouter } = await import("./project");

const createCaller = createCallerFactory(
	createTRPCRouter({ project: projectRouter } satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

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

function unauthedContext() {
	return {
		session: null as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

beforeEach(() => {
	projectsFindResults = [];
	githubReposFindResults = [];
	sandboxImagesFindResults = [];
	projectInsertReturningResults = [];
	sandboxInsertValuesCalls.length = 0;

	projectsFindFirst.mockClear();
	githubReposFindFirst.mockClear();
	sandboxImagesFindFirst.mockClear();
	projectInsertReturning.mockClear();
	projectInsertValues.mockClear();
	sandboxInsertValues.mockClear();
	dbInsert.mockClear();

	verifyOrgMembershipMock.mockClear();
	verifyOrgOwnerMock.mockClear();
});

const baseCreateInput = {
	organizationId: ORG_ID,
	name: "Acme",
	slug: "acme",
	repoOwner: "acme",
	repoName: "repo",
	repoUrl: "https://github.com/acme/repo",
};

describe("project.create — sandbox image threading", () => {
	it("inserts a sandbox_images row with empty defaults when no config is supplied", async () => {
		projectInsertReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID },
		]);
		const caller = createCaller(authedContext());

		await caller.project.create(baseCreateInput);

		expect(sandboxInsertValuesCalls).toHaveLength(1);
		expect(sandboxInsertValuesCalls[0]).toMatchObject({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
		});
		// No config keys forced when omitted — schema defaults apply.
		expect(sandboxInsertValuesCalls[0]).not.toHaveProperty("baseImage");
	});

	it("threads supplied sandbox image config onto the inserted row", async () => {
		projectInsertReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID },
		]);
		const caller = createCaller(authedContext());

		await caller.project.create({
			...baseCreateInput,
			sandboxImage: {
				baseImage: "ubuntu:24.04",
				setupCommands: ["apt-get update", "bun install"],
				systemPackages: ["git", "curl"],
			},
		});

		expect(sandboxInsertValuesCalls[0]).toMatchObject({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			baseImage: "ubuntu:24.04",
			setupCommands: ["apt-get update", "bun install"],
			systemPackages: ["git", "curl"],
		});
	});
});

describe("project.getSandboxImage", () => {
	it("rejects unauthenticated callers", async () => {
		const caller = createCaller(unauthedContext());
		await expect(
			caller.project.getSandboxImage({
				projectId: PROJECT_ID,
				organizationId: ORG_ID,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("returns the sandbox image config for an accessible project", async () => {
		projectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		sandboxImagesFindResults.push({
			id: "sb-1",
			projectId: PROJECT_ID,
			organizationId: ORG_ID,
			baseImage: "ubuntu:24.04",
			setupCommands: ["bun install"],
			systemPackages: ["git"],
		});

		const caller = createCaller(authedContext());
		const result = await caller.project.getSandboxImage({
			projectId: PROJECT_ID,
			organizationId: ORG_ID,
		});

		expect(result).toMatchObject({
			projectId: PROJECT_ID,
			baseImage: "ubuntu:24.04",
			setupCommands: ["bun install"],
			systemPackages: ["git"],
		});
	});

	it("returns null when no sandbox image row exists yet", async () => {
		projectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		sandboxImagesFindResults.push(null);

		const caller = createCaller(authedContext());
		const result = await caller.project.getSandboxImage({
			projectId: PROJECT_ID,
			organizationId: ORG_ID,
		});

		expect(result).toBeNull();
	});
});
