import { describe, expect, it, mock } from "bun:test";

import {
	type FeatureFlagDb,
	resolveUserFlag,
	upsertUserFlagOverride,
} from "./feature-flags";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const UPDATED_BY = "22222222-2222-4222-8222-222222222222";

describe("resolveUserFlag (WS-O T5 — DB half)", () => {
	it("returns the stored boolean when an override row exists", async () => {
		const findFirst = mock(async () => ({ value: true }));
		const db = {
			query: { userFeatureFlags: { findFirst } },
		} as unknown as FeatureFlagDb;

		const result = await resolveUserFlag(
			{ userId: USER_ID, key: "agents.cabinet" },
			db,
		);

		expect(result).toBe(true);
		expect(findFirst).toHaveBeenCalledTimes(1);
	});

	it("returns false when the override forces OFF", async () => {
		const db = {
			query: {
				userFeatureFlags: { findFirst: mock(async () => ({ value: false })) },
			},
		} as unknown as FeatureFlagDb;

		expect(await resolveUserFlag({ userId: USER_ID, key: "x" }, db)).toBe(
			false,
		);
	});

	it("returns null (inherit → PostHog) when no override row exists", async () => {
		const db = {
			query: {
				userFeatureFlags: { findFirst: mock(async () => undefined) },
			},
		} as unknown as FeatureFlagDb;

		expect(await resolveUserFlag({ userId: USER_ID, key: "x" }, db)).toBeNull();
	});
});

describe("upsertUserFlagOverride (WS-O T5 — DB half)", () => {
	it("DELETEs the override row when value is null (back to inherit)", async () => {
		const where = mock(async () => undefined);
		const del = mock(() => ({ where }));
		const insert = mock(() => ({
			values: () => ({ onConflictDoUpdate: async () => undefined }),
		}));
		const db = { delete: del, insert } as unknown as FeatureFlagDb;

		await upsertUserFlagOverride(
			{ userId: USER_ID, key: "x", value: null, updatedBy: UPDATED_BY },
			db,
		);

		expect(del).toHaveBeenCalledTimes(1);
		expect(where).toHaveBeenCalledTimes(1);
		expect(insert).not.toHaveBeenCalled();
	});

	it("UPSERTs (insert ... on conflict do update) when value is a boolean", async () => {
		const onConflictDoUpdate = mock(async () => undefined);
		const values = mock(() => ({ onConflictDoUpdate }));
		const insert = mock(() => ({ values }));
		const del = mock(() => ({ where: async () => undefined }));
		const db = { insert, delete: del } as unknown as FeatureFlagDb;

		await upsertUserFlagOverride(
			{ userId: USER_ID, key: "x", value: true, updatedBy: UPDATED_BY },
			db,
		);

		expect(insert).toHaveBeenCalledTimes(1);
		expect(values).toHaveBeenCalledTimes(1);
		expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
		expect(del).not.toHaveBeenCalled();
	});
});

describe("flag helpers are re-exported from @rox/db/utils (WS-O T5)", () => {
	it("exposes resolveUserFlag + upsertUserFlagOverride on the utils barrel", async () => {
		// The utils barrel transitively imports ./client (membership.ts), which
		// constructs the Neon client at module load. Stub it so the import chain
		// resolves without a DATABASE_URL — this test only asserts re-export wiring.
		mock.module("./client", () => ({ db: {}, dbWs: {} }));
		const utils = await import("./utils");
		expect(typeof utils.resolveUserFlag).toBe("function");
		expect(typeof utils.upsertUserFlagOverride).toBe("function");
	});
});
