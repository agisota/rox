import { describe, expect, test } from "bun:test";

import {
	cloudWorkspaceConfigSchema,
	localWorkspaceConfigSchema,
	roxLedgerEntrySchema,
	roxTopUpInputSchema,
	roxTopupViewSchema,
	sandboxImageSchema,
	workspaceConfigSchema,
} from "./zod";

describe("localWorkspaceConfigSchema", () => {
	test("accepts a path + branch", () => {
		const parsed = localWorkspaceConfigSchema.parse({
			path: "/Users/me/repo",
			branch: "main",
		});
		expect(parsed).toEqual({ path: "/Users/me/repo", branch: "main" });
	});

	test("rejects a missing branch", () => {
		expect(
			localWorkspaceConfigSchema.safeParse({ path: "/Users/me/repo" }).success,
		).toBe(false);
	});

	test("rejects a non-string path", () => {
		expect(
			localWorkspaceConfigSchema.safeParse({ path: 42, branch: "main" })
				.success,
		).toBe(false);
	});
});

describe("cloudWorkspaceConfigSchema", () => {
	test("requires status and defaults spawnFailureCount to 0", () => {
		const parsed = cloudWorkspaceConfigSchema.parse({ status: "ready" });
		expect(parsed.status).toBe("ready");
		expect(parsed.spawnFailureCount).toBe(0);
	});

	test("rejects an invalid sandbox status", () => {
		expect(
			cloudWorkspaceConfigSchema.safeParse({ status: "deleted" }).success,
		).toBe(false);
	});

	test("rejects a missing status", () => {
		expect(cloudWorkspaceConfigSchema.safeParse({}).success).toBe(false);
	});

	test("carries optional modal identifiers through", () => {
		const parsed = cloudWorkspaceConfigSchema.parse({
			status: "running",
			modalSandboxId: "sb_123",
			lastSpawnedAt: "2026-06-20T00:00:00Z",
		});
		expect(parsed.modalSandboxId).toBe("sb_123");
		expect(parsed.lastSpawnedAt).toBe("2026-06-20T00:00:00Z");
	});
});

describe("workspaceConfigSchema (union)", () => {
	test("accepts a local config branch of the union", () => {
		const parsed = workspaceConfigSchema.parse({
			path: "/repo",
			branch: "dev",
		});
		expect(parsed).toMatchObject({ path: "/repo", branch: "dev" });
	});

	test("accepts a cloud config branch of the union", () => {
		const parsed = workspaceConfigSchema.parse({ status: "ready" });
		expect(parsed).toMatchObject({ status: "ready" });
	});

	test("rejects an object matching neither branch", () => {
		expect(workspaceConfigSchema.safeParse({ foo: "bar" }).success).toBe(false);
	});
});

describe("sandboxImageSchema", () => {
	test("defaults setupCommands and systemPackages to empty arrays", () => {
		const parsed = sandboxImageSchema.parse({});
		expect(parsed.setupCommands).toEqual([]);
		expect(parsed.systemPackages).toEqual([]);
	});

	test("accepts a null baseImage", () => {
		const parsed = sandboxImageSchema.parse({ baseImage: null });
		expect(parsed.baseImage).toBeNull();
	});

	test("rejects non-string entries in setupCommands", () => {
		expect(
			sandboxImageSchema.safeParse({ setupCommands: ["ok", 5] }).success,
		).toBe(false);
	});
});

describe("roxTopUpInputSchema", () => {
	test("accepts a positive usdtAmount", () => {
		expect(roxTopUpInputSchema.parse({ usdtAmount: 10 }).usdtAmount).toBe(10);
	});

	test("rejects a zero or negative amount", () => {
		expect(roxTopUpInputSchema.safeParse({ usdtAmount: 0 }).success).toBe(
			false,
		);
		expect(roxTopUpInputSchema.safeParse({ usdtAmount: -5 }).success).toBe(
			false,
		);
	});
});

describe("roxLedgerEntrySchema", () => {
	const base = {
		id: "11111111-1111-4111-8111-111111111111",
		deltaRox: "100",
		kind: "topup" as const,
		usageRequestId: null,
		topupId: null,
		createdAt: new Date(),
	};

	test("accepts a well-formed ledger entry", () => {
		expect(roxLedgerEntrySchema.safeParse(base).success).toBe(true);
	});

	test("rejects a non-uuid id", () => {
		expect(
			roxLedgerEntrySchema.safeParse({ ...base, id: "not-a-uuid" }).success,
		).toBe(false);
	});

	test("rejects an unknown ledger kind", () => {
		expect(
			roxLedgerEntrySchema.safeParse({ ...base, kind: "refund" }).success,
		).toBe(false);
	});

	test("requires createdAt to be a Date, not a string", () => {
		expect(
			roxLedgerEntrySchema.safeParse({
				...base,
				createdAt: "2026-06-20",
			}).success,
		).toBe(false);
	});
});

describe("roxTopupViewSchema", () => {
	const base = {
		id: "22222222-2222-4222-8222-222222222222",
		usdtAmount: "10",
		roxAmount: "1000",
		dvnetInvoiceId: "inv_1",
		status: "pending" as const,
		confirmedAt: null,
		createdAt: new Date(),
	};

	test("accepts a well-formed topup view with null confirmedAt", () => {
		expect(roxTopupViewSchema.safeParse(base).success).toBe(true);
	});

	test("rejects an invalid topup status", () => {
		expect(
			roxTopupViewSchema.safeParse({ ...base, status: "refunded" }).success,
		).toBe(false);
	});
});
