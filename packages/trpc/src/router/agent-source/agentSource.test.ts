import { beforeEach, describe, expect, it, mock } from "bun:test";
import { randomBytes } from "node:crypto";
import * as realDbSchema from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import * as realDrizzleOrm from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import {
	createAgentSourceSchema,
	setAgentSourceStatusSchema,
	updateAgentSourceSchema,
} from "./schema";

// Crypto key for at-rest credential round-tripping. Honor a gate/CI-provided
// SECRETS_ENCRYPTION_KEY when present; otherwise fall back to an ephemeral
// 32-byte test key so these tests stay hermetic and pass without external env
// (the CI Test job sets no SECRETS_ENCRYPTION_KEY secret).
process.env.SECRETS_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

// ---------------------------------------------------------------------------
// DB-free unit tests: crypto round-trip + zod schemas + credential discipline.
// These never touch a database or the tRPC caller harness.
// ---------------------------------------------------------------------------

describe("crypto round-trip (AES-256-GCM)", () => {
	it("encrypts a credential map and decrypts back to the original object", () => {
		const original = { token: "x", apiKey: "super-secret-value" };
		const encrypted = encryptSecret(JSON.stringify(original));

		const decrypted = JSON.parse(decryptSecret(encrypted)) as Record<
			string,
			string
		>;

		expect(decrypted).toEqual(original);
	});

	it("round-trips multi-byte UTF-8 plaintext", () => {
		const original = { token: "ключ", label: "東京" };
		const encrypted = encryptSecret(JSON.stringify(original));

		const decrypted = JSON.parse(decryptSecret(encrypted)) as Record<
			string,
			string
		>;

		expect(decrypted).toEqual(original);
	});

	it("does not leak plaintext into the ciphertext", () => {
		const plaintext = JSON.stringify({ token: "plaintext-needle" });
		const encrypted = encryptSecret(plaintext);

		expect(encrypted).not.toContain("plaintext-needle");
		expect(encrypted).not.toContain(plaintext);
	});

	it("produces a different ciphertext each call (random IV)", () => {
		const plaintext = JSON.stringify({ token: "x" });
		expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
	});
});

describe("createAgentSourceSchema", () => {
	const base = {
		organizationId: "22222222-2222-4222-8222-222222222222",
		name: "Claude Code",
		slug: "claude-code",
		kind: "claude_code" as const,
	};

	it("accepts a minimal valid input", () => {
		const parsed = createAgentSourceSchema.safeParse(base);
		expect(parsed.success).toBe(true);
	});

	it("accepts a full valid input with optional credentials/config", () => {
		const parsed = createAgentSourceSchema.safeParse({
			...base,
			v2ProjectId: "33333333-3333-4333-8333-333333333333",
			description: "An external agent source",
			endpointUrl: "https://agent.example.com/run",
			config: { model: "opus" },
			capabilities: ["code", "review"],
			version: "1.0.0",
			credentials: { token: "secret" },
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects a non-kebab-case slug", () => {
		const parsed = createAgentSourceSchema.safeParse({
			...base,
			slug: "Claude_Code",
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects an unknown kind", () => {
		const parsed = createAgentSourceSchema.safeParse({
			...base,
			kind: "not_a_real_kind",
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects a non-uuid organizationId", () => {
		const parsed = createAgentSourceSchema.safeParse({
			...base,
			organizationId: "not-a-uuid",
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects non-string credential values", () => {
		const parsed = createAgentSourceSchema.safeParse({
			...base,
			credentials: { token: 123 },
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects non-HTTPS endpoint URLs", () => {
		const parsed = createAgentSourceSchema.safeParse({
			...base,
			endpointUrl: "http://agent.example.com/run",
		});
		expect(parsed.success).toBe(false);
	});
});

describe("setAgentSourceStatusSchema", () => {
	const ids = {
		id: "44444444-4444-4444-8444-444444444444",
		organizationId: "22222222-2222-4222-8222-222222222222",
	};

	it("accepts a valid status", () => {
		const parsed = setAgentSourceStatusSchema.safeParse({
			...ids,
			status: "active",
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects an unknown status", () => {
		const parsed = setAgentSourceStatusSchema.safeParse({
			...ids,
			status: "paused",
		});
		expect(parsed.success).toBe(false);
	});
});

describe("updateAgentSourceSchema", () => {
	it("accepts a nullable description/endpointUrl clear", () => {
		const parsed = updateAgentSourceSchema.safeParse({
			id: "44444444-4444-4444-8444-444444444444",
			organizationId: "22222222-2222-4222-8222-222222222222",
			description: null,
			endpointUrl: null,
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects non-HTTPS endpoint URLs", () => {
		const parsed = updateAgentSourceSchema.safeParse({
			id: "44444444-4444-4444-8444-444444444444",
			organizationId: "22222222-2222-4222-8222-222222222222",
			endpointUrl: "http://agent.example.com/run",
		});
		expect(parsed.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Mocked-DB caller tests, following the integration/github + integration/linear
// harness: db.select/dbWs.insert chains and ../utils auth gates are mocked, so
// no real database, network, or membership/admin lookup is required. Real crypto runs
// (SECRETS_ENCRYPTION_KEY is ensured at the top of this file) so credential
// round-tripping is exercised end-to-end through getDecryptedConfig.
// ---------------------------------------------------------------------------

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));

// db/dbWs.select(projection).from(...).where(...).orderBy(...) -> array (list)
// db/dbWs.select(projection).from(...).where(...).limit(...)   -> array
// (get / getDecryptedConfig / write-path reference validation)
let selectResults: unknown[][] = [];
const lastSelectProjection: { value: unknown } = { value: undefined };
const selectOrderBy = mock(async () => selectResults.shift() ?? []);
const selectLimit = mock(async () => selectResults.shift() ?? []);
const selectWhere = mock(() => ({
	orderBy: selectOrderBy,
	limit: selectLimit,
}));
const selectFrom = mock(() => ({ where: selectWhere }));
const dbSelect = mock((projection: unknown) => {
	lastSelectProjection.value = projection;
	return { from: selectFrom };
});

// dbWs.insert(...).values(...).returning(projection) -> array  (create)
let insertReturningResults: unknown[][] = [];
const insertReturning = mock(async () => insertReturningResults.shift() ?? []);
const insertValues = mock(() => ({ returning: insertReturning }));
const dbWsInsert = mock(() => ({ values: insertValues }));

// dbWs.update(...).set(...).where(...).returning(projection) -> array  (update / setStatus)
let updateReturningResults: unknown[][] = [];
const updateReturning = mock(async () => updateReturningResults.shift() ?? []);
const updateWhere = mock(() => ({ returning: updateReturning }));
const updateSet = mock(() => ({ where: updateWhere }));
const dbWsUpdate = mock(() => ({ set: updateSet }));

// dbWs.delete(...).where(...).returning({ id }) -> array  (delete)
let deleteReturningResults: unknown[][] = [];
const deleteReturning = mock(async () => deleteReturningResults.shift() ?? []);
const deleteWhere = mock(() => ({ returning: deleteReturning }));
const dbWsDelete = mock(() => ({ where: deleteWhere }));

mock.module("@rox/db/client", () => ({
	db: { select: dbSelect },
	dbWs: {
		select: dbSelect,
		insert: dbWsInsert,
		update: dbWsUpdate,
		delete: dbWsDelete,
	},
}));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	agentSources: {
		id: "agent_sources.id",
		organizationId: "agent_sources.organization_id",
		v2ProjectId: "agent_sources.v2_project_id",
		ownerUserId: "agent_sources.owner_user_id",
		slug: "agent_sources.slug",
		name: "agent_sources.name",
		description: "agent_sources.description",
		kind: "agent_sources.kind",
		status: "agent_sources.status",
		integrationConnectionId: "agent_sources.integration_connection_id",
		config: "agent_sources.config",
		capabilities: "agent_sources.capabilities",
		endpointUrl: "agent_sources.endpoint_url",
		version: "agent_sources.version",
		encryptedConfig: "agent_sources.encrypted_config",
		createdAt: "agent_sources.created_at",
		updatedAt: "agent_sources.updated_at",
	},
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgMembership: verifyOrgMembershipMock,
}));

mock.module("drizzle-orm", () => ({
	...realDrizzleOrm,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	desc: (col: unknown) => ({ type: "desc", col }),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { agentSourceRouter, publicSelect } = await import("./agentSource");

const createCaller = createCallerFactory(
	createTRPCRouter({
		agentSource: agentSourceRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "44444444-4444-4444-8444-444444444444";

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

const sampleSource = {
	id: SOURCE_ID,
	organizationId: ORG_ID,
	v2ProjectId: null,
	ownerUserId: USER_ID,
	slug: "claude-code",
	name: "Claude Code",
	description: null,
	kind: "claude_code",
	status: "draft",
	integrationConnectionId: null,
	config: {},
	capabilities: [],
	endpointUrl: null,
	version: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
	selectResults = [];
	insertReturningResults = [];
	updateReturningResults = [];
	deleteReturningResults = [];
	lastSelectProjection.value = undefined;

	dbSelect.mockClear();
	selectFrom.mockClear();
	selectWhere.mockClear();
	selectOrderBy.mockClear();
	selectLimit.mockClear();
	dbWsInsert.mockClear();
	insertValues.mockClear();
	insertReturning.mockClear();
	dbWsUpdate.mockClear();
	updateSet.mockClear();
	updateWhere.mockClear();
	updateReturning.mockClear();
	dbWsDelete.mockClear();
	deleteWhere.mockClear();
	deleteReturning.mockClear();

	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
	verifyOrgAdminMock.mockReset();
	verifyOrgAdminMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));
});

describe("credential discipline (publicSelect)", () => {
	it("never projects encryptedConfig", () => {
		expect(Object.keys(publicSelect)).not.toContain("encryptedConfig");
	});

	it("projects only client-safe columns", () => {
		// Exact allow-list so a future column addition has to be reviewed here.
		expect(Object.keys(publicSelect).sort()).toEqual(
			[
				"capabilities",
				"config",
				"createdAt",
				"description",
				"endpointUrl",
				"id",
				"integrationConnectionId",
				"kind",
				"name",
				"organizationId",
				"ownerUserId",
				"slug",
				"status",
				"updatedAt",
				"v2ProjectId",
				"version",
			].sort(),
		);
	});
});

describe("agentSource.list", () => {
	it("returns rows for the org and uses the public projection", async () => {
		selectResults.push([sampleSource]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.list({ organizationId: ORG_ID });

		expect(result).toEqual([sampleSource]);
		expect(verifyOrgMembershipMock).toHaveBeenCalledTimes(1);
		// list reads through the credential-free projection.
		expect(
			Object.keys(lastSelectProjection.value as Record<string, unknown>),
		).not.toContain("encryptedConfig");
	});

	it("requires membership", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "member only" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.list({ organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("agentSource.get", () => {
	it("returns the row when found", async () => {
		selectResults.push([sampleSource]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.get({
			id: SOURCE_ID,
			organizationId: ORG_ID,
		});

		expect(result).toEqual(sampleSource);
	});

	it("throws NOT_FOUND when the row is missing", async () => {
		selectResults.push([]);
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.get({ id: SOURCE_ID, organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("agentSource.create", () => {
	it("creates a source, requires admin, and returns no encryptedConfig", async () => {
		insertReturningResults.push([sampleSource]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.create({
			organizationId: ORG_ID,
			name: "Claude Code",
			slug: "claude-code",
			kind: "claude_code",
			credentials: { token: "secret" },
		});

		expect(result).toEqual(sampleSource);
		expect(result).not.toHaveProperty("encryptedConfig");
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
		expect(dbWsInsert).toHaveBeenCalledTimes(1);

		// Credentials are encrypted (not stored verbatim) before insertion.
		const insertedValues = insertValues.mock.calls[0]?.[0] as {
			encryptedConfig: string | null;
		};
		expect(insertedValues.encryptedConfig).toBeTruthy();
		expect(insertedValues.encryptedConfig).not.toContain("secret");
		// And the stored ciphertext decrypts back to the supplied credentials.
		expect(
			JSON.parse(decryptSecret(insertedValues.encryptedConfig as string)),
		).toEqual({ token: "secret" });
	});

	it("validates referenced project and integration connection before insert", async () => {
		selectResults.push([{ id: "project-1" }], [{ id: "connection-1" }]);
		insertReturningResults.push([sampleSource]);
		const caller = createCaller(authedContext());

		await caller.agentSource.create({
			organizationId: ORG_ID,
			v2ProjectId: "33333333-3333-4333-8333-333333333333",
			integrationConnectionId: "55555555-5555-4555-8555-555555555555",
			name: "Claude Code",
			slug: "claude-code",
			kind: "claude_code",
		});

		expect(dbSelect).toHaveBeenCalledTimes(2);
		expect(dbWsInsert).toHaveBeenCalledTimes(1);
	});

	it("rejects a referenced project outside the organization", async () => {
		selectResults.push([]);
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.create({
				organizationId: ORG_ID,
				v2ProjectId: "33333333-3333-4333-8333-333333333333",
				name: "Claude Code",
				slug: "claude-code",
				kind: "claude_code",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(dbWsInsert).not.toHaveBeenCalled();
	});

	it("stores null encryptedConfig when no credentials are supplied", async () => {
		insertReturningResults.push([sampleSource]);
		const caller = createCaller(authedContext());

		await caller.agentSource.create({
			organizationId: ORG_ID,
			name: "Claude Code",
			slug: "claude-code",
			kind: "claude_code",
		});

		const insertedValues = insertValues.mock.calls[0]?.[0] as {
			encryptedConfig: string | null;
		};
		expect(insertedValues.encryptedConfig).toBeNull();
	});

	it("requires admin access", async () => {
		verifyOrgAdminMock.mockImplementationOnce(async () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
		});
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.create({
				organizationId: ORG_ID,
				name: "Claude Code",
				slug: "claude-code",
				kind: "claude_code",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(dbWsInsert).not.toHaveBeenCalled();
	});
});

describe("agentSource.update", () => {
	it("updates supplied fields and re-encrypts credentials", async () => {
		updateReturningResults.push([{ ...sampleSource, name: "Renamed" }]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.update({
			id: SOURCE_ID,
			organizationId: ORG_ID,
			name: "Renamed",
			credentials: { token: "rotated" },
		});

		expect(result).toMatchObject({ name: "Renamed" });
		expect(result).not.toHaveProperty("encryptedConfig");

		const updates = updateSet.mock.calls[0]?.[0] as {
			name?: string;
			encryptedConfig?: string;
		};
		expect(updates.name).toBe("Renamed");
		expect(updates.encryptedConfig).toBeTruthy();
		expect(
			JSON.parse(decryptSecret(updates.encryptedConfig as string)),
		).toEqual({ token: "rotated" });
	});

	it("rejects a referenced integration connection outside the organization", async () => {
		selectResults.push([]);
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.update({
				id: SOURCE_ID,
				organizationId: ORG_ID,
				integrationConnectionId: "55555555-5555-4555-8555-555555555555",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(dbWsUpdate).not.toHaveBeenCalled();
	});

	it("throws BAD_REQUEST when no fields are supplied", async () => {
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.update({ id: SOURCE_ID, organizationId: ORG_ID }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(dbWsUpdate).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the row is missing", async () => {
		updateReturningResults.push([]);
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.update({
				id: SOURCE_ID,
				organizationId: ORG_ID,
				name: "Renamed",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("agentSource.setStatus", () => {
	it("updates the status and returns the public row", async () => {
		updateReturningResults.push([{ ...sampleSource, status: "active" }]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.setStatus({
			id: SOURCE_ID,
			organizationId: ORG_ID,
			status: "active",
		});

		expect(result).toMatchObject({ status: "active" });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
		expect(updateSet.mock.calls[0]?.[0]).toEqual({ status: "active" });
	});

	it("throws NOT_FOUND when the row is missing", async () => {
		updateReturningResults.push([]);
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.setStatus({
				id: SOURCE_ID,
				organizationId: ORG_ID,
				status: "active",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("agentSource.delete", () => {
	it("returns success when a row was deleted", async () => {
		deleteReturningResults.push([{ id: SOURCE_ID }]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.delete({
			id: SOURCE_ID,
			organizationId: ORG_ID,
		});

		expect(result).toEqual({ success: true });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
	});

	it("returns success=false when nothing was deleted", async () => {
		deleteReturningResults.push([]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.delete({
			id: SOURCE_ID,
			organizationId: ORG_ID,
		});

		expect(result).toEqual({ success: false });
	});
});

describe("agentSource.getDecryptedConfig", () => {
	it("decrypts and returns the credential map", async () => {
		const encryptedConfig = encryptSecret(JSON.stringify({ token: "x" }));
		selectResults.push([{ id: SOURCE_ID, encryptedConfig }]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.getDecryptedConfig({
			id: SOURCE_ID,
			organizationId: ORG_ID,
		});

		expect(result).toEqual({ id: SOURCE_ID, credentials: { token: "x" } });
		expect(verifyOrgAdminMock).toHaveBeenCalledTimes(1);
	});

	it("returns null credentials when none are stored", async () => {
		selectResults.push([{ id: SOURCE_ID, encryptedConfig: null }]);
		const caller = createCaller(authedContext());

		const result = await caller.agentSource.getDecryptedConfig({
			id: SOURCE_ID,
			organizationId: ORG_ID,
		});

		expect(result).toEqual({ id: SOURCE_ID, credentials: null });
	});

	it("throws NOT_FOUND when the row is missing", async () => {
		selectResults.push([]);
		const caller = createCaller(authedContext());

		await expect(
			caller.agentSource.getDecryptedConfig({
				id: SOURCE_ID,
				organizationId: ORG_ID,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
